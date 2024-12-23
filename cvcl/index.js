const express = require('express');
const bodyParser = require('body-parser');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);
const { GoogleGenerativeAI } = require("@google/generative-ai");

(async function() {
  const [apiKey, rawPortfolio] = await Promise.all([
    fs.readFile(path.join(__dirname, '.env'), 'utf8'),
    fs.readFile(path.join(__dirname, 'data', 'portfolio.tex'), 'utf8'),
  ]);
  const projs = [...rawPortfolio.match(/(?<=\\def)\\p[a-zA-z]+/g)];
  let projsDescription = '';
  for (const proj of projs) {
    const id = rawPortfolio.indexOf(proj) + proj.length;
    projsDescription += `---- BEGIN PROJECT \`${proj}\` ----\n`;
    projsDescription += rawPortfolio.substr(id)
      .match(/(?<=\\project)[\s\S]+?\n\n/m)[0]
      .replace(/\\par\b/g, '')
      .replace(/\\g?hhref\{[^}]*\}/, '').trim();
    projsDescription += `\n---- END PROJECT \`${proj}\` ----\n`;
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const app = express();

  app.use(express.static(__dirname + '/public'));

  app.get('/projs', (req, res) => {
    res.json(projs);
  });

  app.post('/projs', bodyParser.raw(), async (req, res) => {
    const prompt = `You are a professional career advisor. You need to decide which project from a portfolio is the best match given the job description to further strengthen a resume. Output a list of job identifiers (the short strings starting with \`\\p\`) only. Besure to put the most relevant project first.

#### BEGIN JOB DESCRIPTION ####
${req.body}
#### END JOB DESCRIPTION ####

#### BEGIN PORTFOLIO ####
${projsDescription}
#### END PORTFOLIO ####

#### BEGIN OUTPUT ####
`;
    const result = await model.generateContent(prompt);
    const txt = result.response.text();
    const recommendation = [];
    for (const rr of txt.trim().split('\n')) {
      const r = rr.trim().replace(/^`|`$/, '');
      if (projs.includes(r))
        recommendation.push(r);
    }
    res.json(recommendation);
  });

  app.post('/pdf', bodyParser.urlencoded(), bodyParser.raw(), async (req, res) => {
    if ('latex' in req.body) {
      req.body = req.body.latex;
    }
    if (!req.body.length) {
      res.sendStatus(400);
      return;
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvcl-'));
    try {
      await Promise.all([
        fs.writeFile(path.join(dir, 'portfolio.tex'), rawPortfolio, 'utf8'),
        fs.writeFile(path.join(dir, 'main.tex'), req.body, 'utf8'),
      ]);
      await exec(
        'latexmk -halt-on-error -file-line-error -pdf -lualatex main.tex',
        { cwd: dir });
      const pdf = await fs.readFile(path.join(dir, 'main.pdf'));
      res.set('Content-Type', 'application/pdf');
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
