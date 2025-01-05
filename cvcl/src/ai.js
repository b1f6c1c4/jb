const path = require('node:path');
const fs = require('node:fs/promises');
const bodyParser = require('body-parser');
const markdownit = require('markdown-it');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const { checkProfile, findProfile } = require('./middleware');

let model, model2;
const llm = async (prompt) => {
  const result = await model.generateContent(prompt);
  return result.response.text();
};
const llm2 = async (prompt) => {
  const chatCompletion = await model2.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.3-70b-versatile',
  });
  return chatCompletion.choices[0].message.content;
};

const mdRenderer = markdownit({
  breaks: true,
  typographer: true,
});

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
  const [apiKey, apiKey2] = await Promise.all([
    fs.readFile(path.join(__dirname, '..', '.env'), 'utf8'),
    fs.readFile(path.join(__dirname, '..', '.env.groq'), 'utf8'),
  ]);
  const genAI = new GoogleGenerativeAI(apiKey)
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  model2 = new OpenAI({
    apiKey: apiKey2.trim(),
    baseURL: 'https://api.groq.com/openai/v1',
  });

  app.post('/profile/:profile/advice', checkProfile, findProfile, bodyParser.text(), async (req, res) => {
    if (!req.query.latex) {
      res.sendStatus(400);
      return;
    }
    const prompt = `
You are a professional HR specialist tasked with analyzing a candidate’s resume against a job listing. The hiring manager believes the resume does not fully match the job requirements. Your objective is to determine:

1. **Exact Keyword Gaps**: Identify specific requirements (keywords or phrases) from the job listing that are absent in the resume.
2. **Potential Keyword Mismatches**: Highlight possible mismatches where the candidate may have used alternative or synonymous terms instead of the exact keywords from the job listing.

### Instructions:

1. Focus on exact keywords or phrases from the job listing that are not present in the resume.
2. Identify alternative or synonymous terms in the resume that could match job requirements but are not an exact match.
3. Clearly separate exact gaps from potential mismatches in your output.
4. Prioritize the most critical discrepancies.
5. Format the output as a detailed Markdown report for clarity and easy reference.

### Example Markdown Output Format:

\`\`\`markdown
# Resume Evaluation Report

## Missing Requirements (Exact Matches)

1. **Requirement Name/Keyword**: [Job Listing Requirement]
   - **Job Listing Context**: [Context of the requirement in the job listing]
   - **Observation**: No matching term found in the resume.

2. **Requirement Name/Keyword**: [Another Missing Requirement]
   - **Job Listing Context**: [Context]
   - **Observation**: Not present.

## Possible Keyword Mismatches (Alternative Terms)

1. **Requirement Name/Keyword**: [Job Listing Requirement]
   - **Job Listing Context**: [Context of the requirement in the job listing]
   - **Resume Term**: [Alternative/Synonym used in the resume]
   - **Evaluation**: [Assessment of how closely the term matches the intent of the job requirement].

2. **Requirement Name/Keyword**: [Another Keyword Mismatch]
   - **Job Listing Context**: [Context]
   - **Resume Term**: [Alternative term found in the resume]
   - **Evaluation**: [Assessment].

## Summary

- **Total Requirements Evaluated**: [X].
- **Missing Exact Matches**: [Number].
- **Potential Mismatches**: [Number].
- Recommendations:
  - Consider clarifying [specific key requirements] with the candidate.
  - Review alternative terms to confirm if they align with the role's expectations.
\`\`\`

#### Job Listing Post Content:
${req.body}

#### User Resume Content:
${req.profile.getDescription(req.query.latex)}

`;
    const md = await llm2(prompt);
    try {
      const html = mdRenderer.render(md);
      res.type('text/html');
      res.send(html);
    } catch {
      res.send(md);
    }
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
    const txt = (await llm2(prompt)).replace(/^``{2}(?:latex)?$/gm, '').trim();
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
