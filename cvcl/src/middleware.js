const path = require('node:path');
const fs = require('node:fs/promises');
const Profile = require('./parsing');
const { profileCache } = require('./cache');

const profileDir = path.join(__dirname, '..', 'data');

async function parsePortfolio(fn) {
  const cacheResult = profileCache.get(fn);
  const fp = path.join(profileDir, fn);
  const st = await fs.stat(fp, { bigint: true });
  if (cacheResult !== undefined && st.mtimeNs === cacheResult.mtime) {
    return cacheResult.profile;
  }
  const rawPortfolio = await fs.readFile(fp, 'utf8');
  const profile = new Profile(fn, rawPortfolio);
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

module.exports = {
  profileDir,
  checkProfile,
  findProfile,
};
