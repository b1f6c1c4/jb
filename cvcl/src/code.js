const bwipjs = require('@bwip-js/node');
const moment = require('moment');
const { latexCache, ev } = require('./cache');
const { checkProfile, findProfile } = require('./middleware');

module.exports = function (app) {
  app.set('view engine', 'ejs');

  app.get('/code', async (req, res) => {
    const text = req.query.t;
    const options = {
      bcid: 'datamatrix',
      text,
      scaleX: 3,
      scaleY: 3,
      includetext: false,
      textalign: 'center',
    };
    const png = await bwipjs.toBuffer(options);
    res.type('.png');
    res.set('Cache-Control', 'public, max-age=999999999999, immutable');
    res.send(png);
  });

  app.get('/pdf417', async (req, res) => {
    const text = req.query.t;
    const options = {
      bcid: 'pdf417',
      text,
      scaleX: 3,
      scaleY: 3,
      includetext: false,
      textalign: 'center',
      columns: 6,
    };
    const png = await bwipjs.toBuffer(options);
    res.type('.png');
    res.set('Cache-Control', 'public, max-age=999999999999, immutable');
    res.send(png);
  });

  app.get('/profile/:profile/code', checkProfile, findProfile, async (req, res) => {
    const latex = req.query.latex ?? latexCache[req.params.profile];
    if (!latex) {
      res.sendStatus(400);
      return;
    }
    const detex = (s) => s
      .replace(/\s*(?:\\\\|\n)\s*/g, ' ')
      .replace(/\\[a-z]+\{([^}])*\}/g, '$1');
    const getCodes = (regex) => {
      const m = req.profile.rawPortfolio.match(regex);
      if (!m) return [];
      const paragraph = req.profile.rawPortfolio.substr(m.index)
        .match(/^[\s\S]+?\n\n/m)[0];
      const lines = [...paragraph.matchAll(/^%> (?<head>[^:]*): (?<text>.*)$/gm)]
        .map(({ groups: { head, text } }) => {
          if (text.match(/^20[0-9][0-9][0-2][0-9][0-3][0-9]$/)) {
            return { head, format: (f) => moment(text).format(f) + '\t' };
          } else {
            const line = { head, texts: [] };
            text.split('|').forEach((t) => {
              let seq = t
                .replaceAll(/(?<!\\)\\n/g, '\n')
                .replaceAll(/(?<!\\)\\r/g, '\r')
                .replaceAll(/(?<!\\)\\t/g, '\t');
              if (seq.endsWith('\t')) {
                line.texts.push(seq.substr(0, seq.length - 1));
                return;
              }
              if (seq.endsWith('\r')) {
                line.texts.push(seq.replace(/\r$/, '\n'));
                line.texts.push(seq.substr(0, seq.length - 1));
                return;
              }
              if (!seq.endsWith('\n'))
                seq += '\t';
              line.texts.push(seq);
            });
            return line;
          }
        });
      const detail = paragraph.match(/(?<=\n\s+\\item\s+)(?:.|\n)*?(?=\\end|\n\s+\\item|$)/g);
      if (detail) {
        lines.push({
          head: 'detail',
          texts: [detail.map((d) => '- ' + detex(d)).join('\n')],
        });
      }
      return lines;
    };
    const data = {
      profile: req.params.profile,
      disp: (s) => {
        if (!s.match(/(?:\t|\n)$/))
          s += '↫';
        else
          s = s.replace(/\t$/, '')
        s = s.replaceAll(/\t/g, '→')
          .replaceAll(/\r?\n/g, '↲');
        return s;
      },
      url: encodeURIComponent,
      sections: [{
        head: 'Default',
        lines: getCodes(/^%>>+$/m),
      }],
    };
    for (const ll of latex.split('\n')) {
      if (ll.match(/^\\(?:ed|e|p|lc|crs|s)[A-Z][a-zA-Z]*$/m)) {
        const lines = getCodes(new RegExp(`^\\\\def\\${ll}`, 'm'));
        if (lines.length) {
          data.sections.push({
            head: ll,
            lines,
          });
        }
      }
    }
    res.render('code.ejs', data);
  });

  app.get('/profile/:profile/change', checkProfile, (req, res) => {
    res.writeHead(200, {
      'Connection': 'keep-alive',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/event-stream',
    });

    function listener() {
      res.write(`PUT\n\n`);
      res.end();
    }
    ev.once(req.params.profile, listener);

    res.on('close', () => {
      ev.removeListener(req.params.profile, listener);
    });
  });
};
