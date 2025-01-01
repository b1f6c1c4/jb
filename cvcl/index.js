const https = require('node:https');
const express = require('express');
const moment = require('moment');
const bodyParser = require('body-parser');
const { LRUCache } = require('lru-cache');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);
const { GoogleGenerativeAI } = require("@google/generative-ai");

const profileCache = new LRUCache({
  max: 16384,
});
const pdfCache = new LRUCache({
  max: 32,
  dispose: (dir) => {
    console.error(`Evicting ${dir}`);
    fs.rm(dir, { force: true, recursive: true });
  },
});
const latexCache = {};

async function cleanUp() {
  console.error('Cleaning');
  const lst = await fs.readdir(os.tmpdir());
  await Promise.all(lst.map((d) => d.startsWith('cvcl-') &&
    fs.rm(path.join(os.tmpdir(), d), { force: true, recursive: true })));
  console.error('Done cleaning');
}

async function parsePortfolio(fn) {
  const cacheResult = profileCache.get(fn);
  const fp = path.join(__dirname, 'data', fn);
  const st = await fs.stat(fp, { bigint: true });
  if (cacheResult !== undefined && st.mtimeNs === cacheResult.mtime) {
    return cacheResult.profile;
  }
  const rawPortfolio = await fs.readFile(fp, 'utf8');
  const profile = {
    file: fp,
    rawPortfolio,
    skills: rawPortfolio.match(/(?<=^\\def)\\s[A-Z][a-zA-z]*/gm),
    sections: rawPortfolio.match(/(?<=^\\def)\\section[A-Z][a-zA-z]*/gm),
    knownSections: {},
  };
  function parsePair(id, regex, nm, single) {
    profile[id] = rawPortfolio.match(regex);
    if (!profile[id]) return;
    let description = '';
    for (const obj of profile[id]) {
      const i = rawPortfolio.indexOf(obj) + obj.length;
      description += `---- BEGIN ${nm} \`${obj}\` ----\n`;
      if (!single) {
        description += rawPortfolio.substr(i)
          .match(/^[\s\S]+?\n\n/m)[0]
          .replace(/\\par\b/g, '')
          .replace(/\\g?hhref\{[^}]*\}/, '').trim();
      } else {
        description += rawPortfolio.substr(i)
          .match(/^.*$/m)[0]
          .replace(/\\par\b/g, '')
          .replace(/\\g?hhref\{[^}]*\}/, '').trim();
      }
      description += `\n---- END ${nm} \`${obj}\` ----\n`;
    }
    profile[id + 'Description'] = description;
  }
  parsePair('edus', /(?<=^\\def)\\ed[A-Z][a-zA-z]*/gm, 'CONFERRED DEGREE');
  parsePair('lics', /(?<=^\\def)\\lc[A-Z][a-zA-z]*/gm, 'LICENSE / CERTIFICATE');
  parsePair('projs', /(?<=^\\def)\\p[A-Z][a-zA-z]*/gm, 'PROJECT');
  parsePair('exps', /(?<=^\\def)\\e[A-Z][a-zA-z]*/gm, 'JOB EXPERIENCE');
  parsePair('crss', /(?<=^\\def)\\crs[A-Z][a-zA-z]*/gm, 'COURSE', true);
  for (const m of rawPortfolio.matchAll(/^% (?<id>[a-z]+)\s+=\s+(?<expr>.*)$/gm)) {
    profile.knownSections[m.groups.expr] = m.groups.id;
  }
  profileCache.set(fn, { mtime: st.mtimeNs, profile });
  return profile;
}

function checkProfile(req, res, next) {
  const p = req.params.profile;
  if (!p) {
    res.status(400).send(':profile not set');
    return;
  }
  if (!p.match(/^[^\/]+\.tex$/)) {
    res.status(403).send(':profile illegal');
    return;
  }
  next();
}

function findProfile(req, res, next) {
  parsePortfolio(req.params.profile).then((obj) => {
    req.profile = obj;
    next();
  }).catch((err) => {
    if (err.code === 'ENOENT') {
      res.sendStatus(404);
    } else {
      console.error(err);
      res.status(500).send(err.toString());
    }
  });
}

(async function() {
  const [apiKey] = await Promise.all([
    fs.readFile(path.join(__dirname, '.env'), 'utf8'),
  ]);

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const app = express();

  app.set('view engine', 'ejs');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

  app.get('/profile', async (req, res) => {
    res.json((await fs.readdir(path.join(__dirname, 'data')))
      .filter((fn) => fn.endsWith('\.tex')));
  });

  app.put('/profile/:profile', checkProfile, bodyParser.text(), async (req, res) => {
    const fp = path.join(__dirname, 'data', req.params.profile);
    try {
      await fs.rename(fp, fp + '.bak');
    } catch {
      // ignore
    }
    await fs.writeFile(fp, req.body, 'utf8');
    res.sendStatus(204);
  });

  app.get('/profile/:profile', checkProfile, findProfile, (req, res) => {
    res.json({
      ...req.profile,
      file: undefined,
      projsDescription: undefined,
    });
  });

  app.post('/revise', bodyParser.json(), async (req, res) => {
    if (!req.body) {
      res.sendStatus(400);
      return;
    }
    const prompt = `You are a professional career advisor. You need to help a mentee to revise their resume, which was written in LaTeX. The mentee has politely requested you to: ${req.body.adj}. Output revised paragraph only. If the original paragraph was in bullet points (i.e. \\item), the output must also be in bullet points.

Original resume paragraph:
\`\`\`latex
${req.body.doc.trim()}
\`\`\`

Revised resume paragraph:
\`\`\`latex
`;
    const result = await model.generateContent(prompt);
    const txt = result.response.text().replace(/^``{2}(?:latex)?$/gm, '').trim();
    if (req.body.doc.indexOf('\n') === -1) {
      res.send(txt);
      return;
    }
    const orig = req.body.doc.split('\n');
    const rvse = txt.split('\n');
    if (Math.abs(orig.length - rvse.length) <= 1) {
      let merged = '';
      while (orig.length || rvse.length) {
        let flag = true;
        if (orig.length) {
          if (orig[0].match(/^\s*$/))
            flag = false;
          merged += orig.splice(0, 1)[0].replace(/(?<=^|\s)(?=\S)/, '% ') + '\n';
        }
        if (flag && rvse.length)
          merged += rvse.splice(0, 1)[0] + '\n';
      }
      merged += req.body.doc.match(/\s*$/);
      res.send(merged);
    } else {
      let merged = '';
      orig.forEach(t => merged += t.replace(/(?<=^|\s)(?=\S)/, '% ') + '\n');
      rvse.forEach(t => merged += t + '\n');
      merged += req.body.doc.match(/\s*$/);
      res.send(merged);
    }
  });

  const mkAuto = (id, section, pmt) => async (req, res) => {
    const prompt = `${pmt}

#### BEGIN JOB DESCRIPTION ####
${req.body}
#### END JOB DESCRIPTION ####

#### BEGIN ${section} ####
${req.profile[id + 'Description']}
#### END ${section} ####

#### BEGIN OUTPUT ####
`;
    const result = await model.generateContent(prompt);
    const txt = result.response.text();
    const recommendation = [];
    for (const rr of txt.trim().split('\n')) {
      const r = rr.trim().replace(/^`|`$/g, '');
      if (req.profile[id].includes(r))
        recommendation.push(r);
    }
    if (!recommendation.length) {
      console.log(prompt);
      console.log(txt);
    }
    res.json(recommendation);
  }

  app.post('/profile/:profile/projs', checkProfile, findProfile, bodyParser.text(), mkAuto('projs', 'PORTFOLIO',
    `You are a professional career advisor. You need to decide which projects from a portfolio are the best match given a job description to further strengthen a resume. Output a list of job identifiers (the short strings starting with \`\\p\`) only. Besure to put the most relevant project first.`));

  app.post('/profile/:profile/exps', checkProfile, findProfile, bodyParser.text(), mkAuto('exps', 'RESUME',
    `You are a professional career advisor. You need to decide which past job experiences from a list are the best match given a job description. Output a list of job experience identifiers (the short strings starting with \`\\e\`) only. You can either sort by in reverse chronological order or put the most relevant job experience first. If none of them fits perfectly, list a couple experiences that are remotely connected, most impressive, and/or up-to-date.`));

  app.post('/profile/:profile/edus', checkProfile, findProfile, bodyParser.text(), mkAuto('edus', 'RESUME',
    `You are a professional career advisor. You need to decide which educational degree from a list are the best match given a job description. Output a list of conferred degree identifiers (the short strings starting with \`\\ed\`) only. You must sort it in reverse chronological order.`));

  app.post('/profile/:profile/crss', checkProfile, findProfile, bodyParser.text(), mkAuto('crss', 'TRANSCRIPT',
    `You are a professional career advisor. You need to decide which courses from a student's transcript are the best match given a job description. Output a list of course identifiers (the short strings starting with \`\\crs\`) only. A maximum of 16 courses is permitted. Put the most relevant job experience first.`));

  app.post('/profile/:profile/lics', checkProfile, findProfile, bodyParser.text(), mkAuto('lics', 'RESUME',
    `You are a professional career advisor. You need to decide which licenses and certificates from a resume are the best match given a job description. Output a list of license & certificate identifiers (the short strings starting with \`\\lc\`) only. Put the most relevant job experience first.`));

  app.get('/profile/:profile/pdf', checkProfile, findProfile, async (req, res) => {
    if (!req.query.latex) {
      res.sendStatus(400);
      return;
    }
    latexCache[req.params.profile] = req.query.latex;
    const cacheKey = req.profile.rawPortfolio + '\n' + req.query.latex;
    const cacheResult = pdfCache.get(cacheKey);
    if (cacheResult !== undefined) {
      res.sendFile(path.join(cacheResult, 'main.pdf'));
      return;
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvcl-'));
    try {
      await fs.writeFile(path.join(dir, 'main.tex'), cacheKey, 'utf8'),
      await exec(
        'latexmk -halt-on-error -file-line-error -pdf -pdflatex -synctex=1 main.tex',
        { cwd: dir });
      await Promise.all([
        fs.access(path.join(dir, 'main.pdf'), fs.constants.R_OK),
        fs.access(path.join(dir, 'main.synctex.gz'), fs.constants.R_OK),
      ]);
      pdfCache.set(cacheKey, dir);
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dir, 'main.pdf'));
    } catch (err) {
      res.type('text/plain');
      try {
        const { stdout } = await exec(
          `texfot --quiet --ignore '^(Over|Under)full ' --ignore '^This is [a-zA-Z]+TeX, Version ' --ignore '^Output written on ' cat main.log`,
          { cwd: dir });
        res.status(422).send(stdout);
      } catch {
        console.error(err);
        res.status(500).send(err.toString());
      }
      await fs.rm(dir, { force: true, recursive: true });
    }
  });

  app.get('/profile/:profile/code', checkProfile, findProfile, async (req, res) => {
    const latex = req.query.latex ?? latexCache[req.params.profile];
    if (!latex) {
      res.sendStatus(400);
      return;
    }
    const getCodes = (regex) => {
      const m = req.profile.rawPortfolio.match(regex);
      if (!m) return [];
      const paragraph = req.profile.rawPortfolio.substr(m.index)
        .match(/^[\s\S]+?\n\n/m)[0];
      const lines = [...paragraph.matchAll(/^%> (?<head>[^:]*): (?<text>.*)$/gm)]
        .map(({ groups: { head, text } }) => {
          if (text.match(/^20[0-9][0-9][0-2][0-9][0-3][0-9]$/)) {
            return { head, format: (f) => moment(text).format(f) };
          } else {
            return { head, text: text.replaceAll(/(?<!\\)\\n/g, '\n').replaceAll(/(?<!\\)\\t/g, '\t') };
          }
        });
      const detail = paragraph.match(/(?<=\n\s+\\item\s+)(?:.|\n)*?(?=\\end|\n\s+\\item|$)/);
      if (detail) {
        lines.push({ head: 'detail', text: detail[0] });
      }
      return lines;
    };
    const data = {
      sections: [{
        head: 'Default',
        lines: getCodes(/^%>>+$/m),
      }],
    };
    for (const ll of latex.split('\n')) {
      if (ll.match(/^\\(?:ed|e|p|lc|crs|s)[A-Z][a-zA-Z]*$/m)) {
        const lines = getCodes(new RegExp(`^\\\\def\\${ll}`, 'm'));
        if (lines.length) {
          data.sections.push({
            head: ll,
            lines,
          });
        }
      }
    }
    res.render('code.ejs', data);
  });

  app.get('/profile/:profile/edit', checkProfile, findProfile, async (req, res) => {
    if (!req.query.latex) {
      res.sendStatus(400);
      return;
    }
    const cacheKey = req.profile.rawPortfolio + '\n' + req.query.latex;
    const dir = pdfCache.get(cacheKey);
    if (dir === undefined) {
      res.sendStatus(410);
      return;
    }
    const split = cacheKey.split('\n');
    let target;
    if (req.query.page) {
      const { stdout } = await exec(
        `synctex edit -o ${req.query.page}:${req.query.x}:${req.query.y}:main.pdf`,
        { cwd: dir });
      const m = [...stdout.matchAll(/^Line:(?<line>[0-9]+)$/gm)];
      if (m.length !== 1) {
        res.status(500).send('synctex failed: ' + stdout);
        return;
      }
      let { line } = m[0].groups;
      while (line && split[line] === '') line--;
      target = split[line];
    } else {
      target = req.query.target;
    }
    const m = target.match(/^\\(?:p|ed|e|s|lc|section)[A-Z][a-zA-Z]*$/);
    if (!m) {
      console.error(`synctex: ${target}`);
      res.send('0');
      return;
    }
    let ln = 1;
    for (const l of split) {
      if (l.startsWith(`\\def${target}`)) {
        res.send('' + ln);
        return;
      }
      ln++;
    }
    res.status(404).send(`\\def not found: ${target}`);
  });

  await cleanUp();
  const [key, cert, ca, dhparam] = await Promise.all([
    'server.key',
    'server.crt',
    'client.crt',
    'dhparam.pem',
  ].map(f => fs.readFile(path.join(__dirname, 'cert', f))));
  https.createServer({
    requestCert: true,
    minVersion: 'TLSv1.3',
    key,
    cert,
    ca,
    dhparam,
  }, app).listen(18080, '0.0.0.0');
})();
