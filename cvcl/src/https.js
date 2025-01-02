const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs/promises');

module.exports = async function () {
  const [key, cert, ca, dhparam] = await Promise.all([
    'server.key',
    'server.crt',
    'client.crt',
    'dhparam.pem',
  ].map(f => fs.readFile(path.join(__dirname, '..', 'cert', f))));
  return (app) => https.createServer({
    requestCert: true,
    minVersion: 'TLSv1.3',
    key,
    cert,
    ca,
    dhparam,
  }, app).listen(18080, '0.0.0.0');
};
