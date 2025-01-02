const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');
const child_process = require('node:child_process');
const bodyParser = require('body-parser');
const { checkProfile, findProfile } = require('./middleware');
const { latexCache, pdfCache, ev } = require('./cache');

const exec = util.promisify(child_process.exec);

async function cleanUp() {
  console.error('Cleaning');
  const lst = await fs.readdir(os.tmpdir());
  await Promise.all(lst.map((d) => d.startsWith('cvcl-') &&
    fs.rm(path.join(os.tmpdir(), d), { force: true, recursive: true })));
  console.error('Done cleaning');
}

module.exports = async function (app) {
  await cleanUp();
  app.get('/profile/:profile/pdf', checkProfile, findProfile, async (req, res) => {
    if (!req.query.latex) {
      res.sendStatus(400);
      return;
    }
    latexCache[req.params.profile] = req.query.latex;
    ev.emit(req.params.profile);
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
};
