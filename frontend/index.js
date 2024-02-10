import pg from 'pg';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import doT from 'dot';
import path from 'node:path';
import mime from 'mime';
import { fileURLToPath } from 'node:url';

const tmpl = doT.template(`
    <div class="flt flt-left">
        {{? it._source['ai_consult'] }}<div><span>Con</span></div>{{?}}
        {{? it._source['ai_cs'] }}<div><span>CS</span></div>{{?}}
        {{? it._source['ai_ee'] }}<div><span>EE</span></div>{{?}}
        {{? it._source['ai_hard'] < 5 }}<div><span>EZ</span><span>{{=it._source['ai_hard']}}</span></div>{{?}}
        {{? it._source['ai_master'] }}<div><span>MS</span></div>{{?}}
        {{? it._source['ai_virtual'] }}<div><span>Virt</span></div>{{?}}
        {{? it._source['ai_hw'] > 6 }}<div><span>HW</span><span>{{=it._source['ai_hw']}}</span></div>{{?}}
        {{? it._source['ai_sw'] > 6 }}<div><span>SW</span><span>{{=it._source['ai_sw']}}</span></div>{{?}}
        {{? it._source['ai_prog'] > 6 }}<div><span>Prog</span><span>{{=it._source['ai_prog']}}</span></div>{{?}}
        {{? it._source['ai_broad'] > 6 }}<div><span>Broad</span><span>{{=it._source['ai_broad']}}</span></div>{{?}}
        {{? it._source['ai_fit'] > 6 }}<div><span>Fit?</span><span>{{=it._source['ai_fit']}}</span></div>{{?}}
    </div>
    <div class="flt flt-right">
        {{? it._source['ai_auth'] < 10 }}<div><span>???</span><span>{{=it._source['ai_auth']}}</span></div>{{?}}
        {{? it._source['ai_team'] < 10 }}<div><span>!Team</span><span>{{=it._source['ai_team']}}</span></div>{{?}}
        {{? it._source['ai_stem'] < 10 }}<div><span>STEM</span><span>{{=it._source['ai_stem']}}</span></div>{{?}}
        {{? it._source['ai_citizen'] }}<div><span>USA</span></div>{{?}}
        {{? it._source['ai_hunter'] > 5 }}<div><span>Hunt</span><span>{{=it._source['ai_hunter']}}</span></div>{{?}}
        {{? it._source['ai_startup'] }}<div><span>S</span></div>{{?}}
        {{? it._source['ai_mgmt'] }}<div><span>Mgmt</span></div>{{?}}
        {{? it._source['ai_labor'] }}<div><span>Labor</span></div>{{?}}
        {{? it._source['ai_customer'] }}<div><span>C-F</span></div>{{?}}
        {{? it._source['ai_travel'] }}<div><span>Trvl</span></div>{{?}}
        {{? it._source['ai_quant'] }}<div><span>Quant</span></div>{{?}}
        {{? !it._source['ai_rnd'] }}<div><span>!R&amp;D</span></div>{{?}}
        {{? it._source['ai_promote'] < 5 }}<div><span>Prmt</span><span>{{=it._source['ai_promote']}}</span></div>{{?}}
        {{? it._source['ai_hw'] < 3 }}<div><span>!HW</span><span>{{=it._source['ai_hw']}}</span></div>{{?}}
        {{? it._source['ai_sw'] < 3 }}<div><span>!SW</span><span>{{=it._source['ai_sw']}}</span></div>{{?}}
        {{? it._source['ai_prog'] < 3 }}<div><span>!Prog</span><span>{{=it._source['ai_prog']}}</span></div>{{?}}
        {{? it._source['ai_year'] >= 3 }}<div><span>Year</span><span>{{=it._source['ai_year']}}</span></div>{{?}}
        {{? it._source['ai_comp'] > 6 }}<div><span>Cptv</span><span>{{=it._source['ai_comp']}}</span></div>{{?}}
        {{? it._source['ai_boring'] > 6 }}<div><span>Bore</span><span>{{=it._source['ai_boring']}}</span></div>{{?}}
    </div>
    <h4>{{=it._source.industries}}/{{=it._source.job_function}}</h4>
    <h1><a href="{{=it._id}}">{{=it._source.job_title}}</a></h1>
    <h2 class="{{=it.class}}">
        {{=it._source.organization_name}}
        &nbsp;@&nbsp;
        <a href="https://www.google.com/maps/place/{{=encodeURIComponent(it._source.location)}}">
            {{=it._source.location}}
        </a>
    </h2>
    <div class="scroller" tabindex="0">
        <article class="{{=it.class}}">{{=it._source.job_description}}</article>
    </div>
`);

function auth(req, res, cb) {
  if (req && /^Basic /.test(req.headers.authorization)) {
    const [user, password] = Buffer.from(req.headers.authorization.split(' ', 2)[1], 'base64').toString('utf8').split(':', 2);
    if (user) {
      const ret = cb(user, password);
      if (ret)
        return ret;
    }
  }
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="You must login", charset="UTF-8"' }).end();
  return null;
}

// Create a local server to receive data from
const server = http.createServer({
  keepAlive: true,
}, async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (/^\/+(?:$|node_modules\/.*)/.test(url.pathname)) {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    try {
      const fn = path.dirname(fileURLToPath(import.meta.url))
        + (/^\/+$/.test(url.pathname) ? '/index.html' : url.pathname);
      const f = await readFile(fn);
      res.writeHead(200, { 'Content-Type': mime.getType(path.extname(fn)) || 'text/plain' }).end(f);
    } catch (e) {
      if (e.code === 'ENOENT') {
        res.writeHead(404).end();
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(e.message);
      }
    }
    return;
  }
  auth(req, res, async (user, password) => {
    const client = new pg.Client({
      user,
      password,
      host: process.env.POSTGRES,
      port: process.env.POSTGRES_PORT,
      database: 'job',
    });
    try {
      await client.connect();
      switch (url.pathname) {
        case '/job':
          switch (req.method) {
            case 'GET':
              if (!url.searchParams.has('q')) {
                res.writeHead(400).end();
                break;
              }
              const sql = url.searchParams.get('q');
              const counts = (await client.query(`
                SELECT
                  COUNT(*) AS all,
                  COUNT(*) FILTER(WHERE good_${user} IS NOT NULL) AS proc,
                  COUNT(*) FILTER(WHERE good_${user}) AS good,
                  COUNT(*) FILTER(WHERE good_${user} AND applied_${user}) AS applied
                FROM (${sql})
                `)).rows[0];
              for (const k in counts)
                counts[k] -= 0;
              const html = tmpl((await client.query(`SELECT * FROM (${sql}) LIMIT 1`)).rows[0]);
              res.writeHead(200, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ counts, html }));
              break;
            case 'PUT':
              if (!url.searchParams.has('id') || !url.searchParams.has('v')) {
                res.writeHead(400).end();
                break;
              }
              const id = url.searchParams.get('id');
              const v = !!+url.searchParams.get('v');
              await client.query(`UPDATE jobs SET good_${user} = $1::boolean WHERE job_link = $2::text`, [v, id]);
              res.writeHead(204).end();
              break;
            default:
              res.writeHead(405).end();
              break;
          }
          break;
        default:
          res.writeHead(404).end();
          break;
      }
    } catch (e) {
      if (/client password must be a string|password authentication failed/.test(e.message)) {
        res.writeHead(401).end();
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(e.message);
      }
    } finally {
      await client.end()
    }
  });
});
server.listen(8800);
