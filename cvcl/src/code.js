const bwipjs = require('@bwip-js/node');
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
      sections: req.profile.getCodes(latex),
    };
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
