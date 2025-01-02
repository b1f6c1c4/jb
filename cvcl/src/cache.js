const EventEmitter = require('node:events');
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

module.exports = {
  profileCache,
  pdfCache,
  latexCache,
  ev,
};
