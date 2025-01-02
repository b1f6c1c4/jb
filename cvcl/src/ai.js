const path = require('node:path');
const fs = require('node:fs/promises');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { checkProfile, findProfile } = require('./middleware');

let model;
const llm = async (prompt) => {
  const result = await model.generateContent(prompt);
  return result.response.text();
};

const mkAuto = (id, section, pmt) => async (req, res) => {
  const prompt = `${pmt}

#### BEGIN JOB DESCRIPTION ####
${req.body}
#### END JOB DESCRIPTION ####

#### BEGIN ${section} ####
${req.profile.data[id].description}
#### END ${section} ####

#### BEGIN OUTPUT ####
`;
  const txt = await llm(prompt);
  const recommendation = [];
  for (const rr of txt.trim().split('\n')) {
    const r = rr.trim().replace(/^`|`$/g, '');
    if (req.profile.data[id].entries.includes(r))
      recommendation.push(r);
  }
  if (!recommendation.length) {
    console.log(prompt);
    console.log(txt);
  }
  res.json(recommendation);
}

module.exports = async function (app) {
  const apiKey = await fs.readFile(path.join(__dirname, '..', '.env'), 'utf8');
  const genAI = new GoogleGenerativeAI(apiKey)
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  app.post('/profile/:profile/advice', checkProfile, findProfile, bodyParser.text(), async (req, res) => {
    if (!req.query.latex) {
      res.sendStatus(400);
      return;
    }
    const prompt = `You are a professional HR with no technical background. The hiring manager have told you to turn away a resume because the person doesn't meet all of the requirements for the role. Now, to better serve the interest of the hiring manager, the company, and the humankind, to make the world a better place, you must find out what specific requirement (original, exact keywords or phrases) that appears on the job listing that are not covered by the resume. Be sure to look for exact matches of keywords and phrases.

#### BEGIN JOB DESCRIPTION ####
${req.body}
#### END JOB DESCRIPTION ####

#### BEGIN RESUME ####
${req.profile.getDescription(req.query.latex)}
#### END RESUME ####

#### BEGIN OUTPUT ####
`;
    res.send(await llm(prompt));
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
    const txt = (await llm(prompt)).replace(/^``{2}(?:latex)?$/gm, '').trim();
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
};
