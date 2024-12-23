const express = require('express');
const fs = require('node:fs/promises');
const { GoogleGenerativeAI } = require("@google/generative-ai");

(async function() {
  const [apiKey, rawPortfolio] = await Promise.all([
    fs.readFile(__dirname + '/.env', 'utf8'),
    fs.readFile(__dirname + '/data/portfolio.tex', 'utf8'),
  ]);
  const projs = [...rawPortfolio.matchAll(/(?<=\\def)\\p[a-zA-z]+/g)];
  let projsDescription = '';
  for (const proj of projs) {
    const id = rawPortfolio.indexOf(proj) + 4 + proj.length;
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

  function rawBody(req, res, next) {
    req.setEncoding('utf8');
    req.body = '';
    req.on('data', function(chunk) {
      req.body += chunk;
    });
    req.on('end', function(){
      next();
    });
  }

  app.get('/projs', (req, res) => {
    res.json(projs);
  });

  app.post('/projs', rawBody, async (req, res) => {
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

  app.listen(3000, '0.0.0.0');
})();
