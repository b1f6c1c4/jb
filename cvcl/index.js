const express = require('express');
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
  max: 16384,
});

async function parsePortfolio(fn) {
  const cacheResult = profileCache.get(fn);
  const fp = path.join(__dirname, 'data', fn);
  const st = await fs.stat(fp, { bigint: true });
  if (cacheResult !== undefined && st.mtimeNs === cacheResult.mtime) {
    return cacheResult.profile;
  }
  const rawPortfolio = await fs.readFile(fp, 'utf8');
  const projs = rawPortfolio.match(/(?<=\\def)\\p[A-Z][a-zA-z]*/g);
  let projsDescription = '';
  if (projs)
    for (const proj of projs) {
      const id = rawPortfolio.indexOf(proj) + proj.length;
      projsDescription += `---- BEGIN PROJECT \`${proj}\` ----\n`;
      projsDescription += rawPortfolio.substr(id)
        .match(/(?<=\\project)[\s\S]+?\n\n/m)[0]
        .replace(/\\par\b/g, '')
        .replace(/\\g?hhref\{[^}]*\}/, '').trim();
      projsDescription += `\n---- END PROJECT \`${proj}\` ----\n`;
    }
  const profile = {
    file: fp,
    rawPortfolio,
    projs,
    projsDescription,
    edus: rawPortfolio.match(/(?<=\\def)\\ed[A-Z][a-zA-z]*/g),
    exps: rawPortfolio.match(/(?<=\\def)\\e[A-Z][a-zA-z]*/g),
    skills: rawPortfolio.match(/(?<=\\def)\\s[A-Z][a-zA-z]*/g),
    sections: rawPortfolio.match(/(?<=\\def)\\section[A-Z][a-zA-z]*/g),
  };
  profileCache.set(fn, { mtime: st.mtimeNs, profile });
  return profile;
}

function checkProfile(req, res, next) {
  const p = req.get('X-Profile');
  if (!p) {
    res.status(400).send('X-Profile not set');
    return;
  }
  if (!p.match(/^[^\/]+\.tex$/)) {
    res.status(403).send('X-Profile illegal');
    return;
  }
  next();
}

function findProfile(req, res, next) {
  parsePortfolio(req.get('X-Profile')).then((obj) => {
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

  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

  app.get('/profiles', async (req, res) => {
    res.json((await fs.readdir(path.join(__dirname, 'data')))
      .filter((fn) => fn.endsWith('\.tex')));
  });

  app.put('/profile', checkProfile, bodyParser.text(), async (req, res) => {
    const fp = path.join(__dirname, 'data', req.get('X-Profile'));
    try {
      await fs.rename(fp, fp + '.bak');
    } catch {
      // ignore
    }
    await fs.writeFile(fp, req.body, 'utf8');
    res.sendStatus(204);
  });

  app.get('/profile', checkProfile, findProfile, (req, res) => {
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

  app.post('/projs', checkProfile, findProfile, bodyParser.text(), async (req, res) => {
    const prompt = `You are a professional career advisor. You need to decide which project from a portfolio is the best match given the job description to further strengthen a resume. Output a list of job identifiers (the short strings starting with \`\\p\`) only. Besure to put the most relevant project first.

#### BEGIN JOB DESCRIPTION ####
${req.body}
#### END JOB DESCRIPTION ####

#### BEGIN PORTFOLIO ####
${req.profile.projsDescription}
#### END PORTFOLIO ####

#### BEGIN OUTPUT ####
`;
    const result = await model.generateContent(prompt);
    const txt = result.response.text();
    const recommendation = [];
    for (const rr of txt.trim().split('\n')) {
      const r = rr.trim().replace(/^`|`$/g, '');
      if (req.profile.projs.includes(r))
        recommendation.push(r);
    }
    res.json(recommendation);
  });

  app.get('/pdf', checkProfile, findProfile, async (req, res) => {
    if (!req.query.latex) {
      res.sendStatus(400);
      return;
    }
    const cacheKey = req.profile.rawPortfolio + req.query.latex;
    const cacheResult = pdfCache.get(cacheKey);
    if (cacheResult !== undefined) {
      res.set('Content-Type', 'application/pdf');
      res.send(cacheResult);
      return;
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvcl-'));
    try {
      await fs.writeFile(path.join(dir, 'main.tex'), cacheKey, 'utf8'),
      await exec(
        'latexmk -halt-on-error -file-line-error -pdf -lualatex main.tex',
        { cwd: dir });
      const pdf = await fs.readFile(path.join(dir, 'main.pdf'));
      pdfCache.set(cacheKey, pdf);
      res.set('Content-Type', 'application/pdf');
      res.set('Cache-Control', 'no-cache');
      res.set('Vary', 'X-Profile');
      res.send(pdf);
    } catch (err) {
      res.set('Content-Type', 'text/plain');
      try {
        const { stdout } = await exec(
          `texfot --quiet --ignore '^(Over|Under)full ' --ignore '^This is pdfTeX, Version ' --ignore '^Output written on ' cat main.log`,
          { cwd: dir });
        res.status(422).send(stdout);
      } catch {
        console.error(err);
        res.status(500).send(err.toString());
      }
    } finally {
      await fs.rm(dir, { force: true, recursive: true });
    }
  });

  app.listen(3000, '0.0.0.0');
})();
