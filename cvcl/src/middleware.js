const path = require('node:path');
const { profileCache } = require('./cache');
const { checkProfile, findProfile } = require('./middleware');

const profileDir = path.join(__dirname, '..', 'data');

async function parsePortfolio(fn) {
  const cacheResult = profileCache.get(fn);
  const fp = path.join(profileDir, fn);
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

module.exports = {
  profileDir,
  checkProfile,
  findProfile,
};
