const path = require('node:path');
const fs = require('node:fs/promises');
const bodyParser = require('body-parser');
const { profileDir, checkProfile, findProfile } = require('./middleware');
const { ev } = require('./cache');

module.exports = async function (app) {
  await fs.mkdir(profileDir, { recursive: true });

  app.get('/profile/', async (req, res) => {
    res.json((await fs.readdir(profileDir))
      .filter((fn) => fn.endsWith('\.tex')));
  });

  app.get('/profile/:profile/entries', checkProfile, findProfile, (req, res) => {
    res.json(req.profile.getEntries());
  });

  app.get('/profile/:profile/', checkProfile, findProfile, (req, res) => {
    res.send(req.profile.rawPortfolio);
  });

  app.put('/profile/:profile/', checkProfile, bodyParser.text(), async (req, res) => {
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
};
