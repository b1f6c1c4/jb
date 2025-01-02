const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');

(async function() {
  const app = express();

  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

  const [https] = await Promise.all([
    require('./src/https'),
    require('./src/ai')(app),
    require('./src/code')(app),
    require('./src/pdf')(app),
    require('./src/profile')(app),
  ]);
  https(app);
})();
