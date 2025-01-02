const path = require('node:path');
const fs = require('node:fs/promises');
const bodyParser = require('body-parser');
const { profileDir, checkProfile, findProfile } = require('./middleware');

module.exports = async function (app) {
  await fs.mkdir(profileDir, { recursive: true });

  app.get('/profile', async (req, res) => {
    res.json((await fs.readdir(profileDir))
      .filter((fn) => fn.endsWith('\.tex')));
  });

  app.put('/profile/:profile', checkProfile, bodyParser.text(), async (req, res) => {
    const fp = path.join(profileDir, req.params.profile);
    try {
      await fs.rename(fp, fp + '.bak');
    } catch {
      // ignore
    }
    await fs.writeFile(fp, req.body, 'utf8');
    ev.emit(req.params.profile);
    res.sendStatus(204);
  });

  app.get('/profile/:profile', checkProfile, findProfile, (req, res) => {
    res.json({
      ...req.profile,
      file: undefined,
      projsDescription: undefined,
    });
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
};
