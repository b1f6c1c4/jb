const EventEmitter = require('node:events');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { LRUCache } = require('lru-cache');

const profileCache = new LRUCache({
  max: 16384,
});
const pdfCache = new LRUCache({
  max: 32,
  dispose: (dir) => {
    console.error(`Evicting ${dir}`);
    fs.rm(dir, { force: true, recursive: true });
  },
});
const latexCache = {};
const ev = new EventEmitter();

const mkJudgeCache = (prompt) => {
  const hash = createHash('md5');
  const judgeDir = path.join(os.tmpdir(), 'cvcl_judge', hash.update(prompt).digest('hex'));
  fs.mkdir(judgeDir, { recursive: true });
  return {
    async get(key) {
      const hash = createHash('md5');
      const fn = path.join(judgeDir, hash.update(key).digest('hex'));
      try {
        return JSON.parse(await fs.readFile(fn, 'utf-8'));
      } catch {
        return null;
      }
    },
    async set(key, obj) {
      const hash = createHash('md5');
      const fn = path.join(judgeDir, hash.update(key).digest('hex'));
      await fs.writeFile(fn, JSON.stringify(obj), 'utf-8');
    },
  };
};

module.exports = {
  profileCache,
  pdfCache,
  latexCache,
  mkJudgeCache,
  ev,
};
