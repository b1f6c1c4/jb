import pg from 'pg';
import http from 'node:http';
import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import doT from 'dot';
import encodeHTML from 'dot/encodeHTML.js';
import path from 'node:path';
import mime from 'mime';
import { fileURLToPath } from 'node:url';

const tmpl = doT.template(`
    <div class="flt flt-left">
        {{? it.ai_consult }}<div><span>Cnslt</span></div>{{?}}
        {{? it.ai_cs }}<div><span>CS</span></div>{{?}}
        {{? it.ai_ee }}<div><span>EE</span></div>{{?}}
        {{? it.ai_hard < 5 }}<div><span>EZ</span><span>{{=it.ai_hard}}</span></div>{{?}}
        {{? it.ai_master }}<div><span>MS</span></div>{{?}}
        {{? it.ai_virtual }}<div><span>Virt</span></div>{{?}}
        {{? it.ai_hw > 6 }}<div><span>HW</span><span>{{=it.ai_hw}}</span></div>{{?}}
        {{? it.ai_sw > 6 }}<div><span>SW</span><span>{{=it.ai_sw}}</span></div>{{?}}
        {{? it.ai_prog > 6 }}<div><span>Prog</span><span>{{=it.ai_prog}}</span></div>{{?}}
        {{? it.ai_broad > 6 }}<div><span>Broad</span><span>{{=it.ai_broad}}</span></div>{{?}}
        {{? it.ai_fit > 6 }}<div><span>Fit?</span><span>{{=it.ai_fit}}</span></div>{{?}}
    </div>
    <div class="flt flt-right">
        {{? it.ai_auth < 10 }}<div><span>???</span><span>{{=it.ai_auth}}</span></div>{{?}}
        {{? it.ai_team < 10 }}<div><span>!Team</span><span>{{=it.ai_team}}</span></div>{{?}}
        {{? it.ai_stem < 10 }}<div><span>STEM</span><span>{{=it.ai_stem}}</span></div>{{?}}
        {{? it.ai_citizen }}<div><span>USA</span></div>{{?}}
        {{? it.ai_hunter > 5 }}<div><span>Hunt</span><span>{{=it.ai_hunter}}</span></div>{{?}}
        {{? it.ai_startup }}<div><span>S</span></div>{{?}}
        {{? it.ai_mgmt }}<div><span>Mgmt</span></div>{{?}}
        {{? it.ai_labor }}<div><span>Labor</span></div>{{?}}
        {{? it.ai_customer }}<div><span>C-F</span></div>{{?}}
        {{? it.ai_travel }}<div><span>Trvl</span></div>{{?}}
        {{? it.ai_quant }}<div><span>Quant</span></div>{{?}}
        {{? !it.ai_rnd }}<div><span>!R&amp;D</span></div>{{?}}
        {{? it.ai_promote < 5 }}<div><span>Prmt</span><span>{{=it.ai_promote}}</span></div>{{?}}
        {{? it.ai_hw < 3 }}<div><span>!HW</span><span>{{=it.ai_hw}}</span></div>{{?}}
        {{? it.ai_sw < 3 }}<div><span>!SW</span><span>{{=it.ai_sw}}</span></div>{{?}}
        {{? it.ai_prog < 3 }}<div><span>!Prog</span><span>{{=it.ai_prog}}</span></div>{{?}}
        {{? it.ai_year >= 3 }}<div><span>Year</span><span>{{=it.ai_year}}</span></div>{{?}}
        {{? it.ai_comp > 6 }}<div><span>Cptv</span><span>{{=it.ai_comp}}</span></div>{{?}}
        {{? it.ai_boring <= 3 }}<div><span>Bore</span><span>{{=it.ai_boring}}</span></div>{{?}}
    </div>
    <h5>{{=it.atime}}/{{=it.source}}</h5>
    <h4>{{=it.industries}}/{{=it.job_function}}</h4>
    <h1><a href="{{=it.job_link}}">{{=it.job_title}}</a></h1>
    <h2 class="{{=it.class}}">
        {{=it.organization_name}}
        {{? it.location }}
          &nbsp;@&nbsp;
          <a href="https://www.google.com/maps/place/{{=encodeURIComponent(it.location)}}">
              {{=it.location}}
          </a>
        {{?}}
    </h2>
    <div class="scroller" tabindex="0">
        <article class="{{=it.class}}">{{=it.job_description}}</article>
    </div>
`);
const flds = doT.template(`
{{~it:x}}<span title="{{=x.ty}}: {{!x.cmt}}">{{=x.fld}}</span>{{~}}
`, { encoders: {'': encodeHTML()} });

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

function cls(o, user) {
  if (o[`applied_${user}`]) {
    return 'applied';
  }
  switch (o[`good_${user}`]) {
    case true: return 'good';
    case false: return 'bad';
    default: return '';
  }
}

// Create a local server to receive data from
const server = http.createServer({
  keepAlive: true,
}, async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (/^\/+(?:$|node_modules\/.*|index\.(?:css|html|js))/.test(url.pathname)) {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    try {
      const fn = path.dirname(fileURLToPath(import.meta.url))
        + (/^\/+$/.test(url.pathname) ? '/index.html' : url.pathname);
      const { mtime } = await fs.stat(fn);
      if (req.headers['if-modified-since']) {
        const diff = mtime - new Date(req.headers['if-modified-since']);
        if (diff < 1e3) {
          res.writeHead(304, {
            'Cache-Control': 'no-cache',
          }).end();
          return;
        }
      }
      const f = await fs.readFile(fn);
      res.writeHead(200, {
        'Content-Type': mime.getType(path.extname(fn)) || 'text/plain',
        'Cache-Control': 'no-cache',
        'Last-Modified': mtime.toUTCString(),
      }).end(f);
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
        case '/fields':
          if (req.method !== 'GET') {
              res.writeHead(405).end();
              break;
          }
          const { rows } = await client.query(`
            SELECT a.attname as fld,
              pg_catalog.format_type(a.atttypid, a.atttypmod) as ty,
              COALESCE(pg_catalog.col_description(a.attrelid, a.attnum), '') as cmt
            FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = (SELECT oid FROM pg_class WHERE relname = 'jobs')
              AND a.attnum > 0 AND NOT a.attisdropped
              AND a.attname != 'ai_fail'
              AND ((a.attname !~ 'good_.*' AND a.attname !~ 'applied_.*')
                OR a.attname ~ '.*_${user}')
            ORDER BY a.attnum;`);
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store',
          }).end(flds(rows));
          break;
        case '/job':
          switch (req.method) {
            case 'GET':
              if (!url.searchParams.has('q')) {
                res.writeHead(400).end();
                break;
              }
              const sql = url.searchParams.get('q');
              const skip = +(url.searchParams.get('s') || 0);
              const counts = (await client.query(`
                SELECT
                  COUNT(*) AS total,
                  COUNT(*) FILTER(WHERE good_${user} IS NOT NULL) AS proc,
                  COUNT(*) FILTER(WHERE good_${user}) AS good,
                  COUNT(*) FILTER(WHERE good_${user} AND applied_${user}) AS applied
                FROM (${sql})
                `)).rows[0];
              for (const k in counts)
                counts[k] -= 0;
              let where;
              if (counts.proc - counts.total)
                where = `good_${user} IS NULL`; // find unprocessed ones first
              else if (counts.applied - counts.good)
                where = `applied_${user} = FALSE`; // find unapplied ones then
              else
                where = 'TRUE';
              const ans = await client.query(`
                WITH a AS MATERIALIZED (
                  SELECT * FROM (${sql})
                  WHERE ${where}
                )
                SELECT * FROM a
                LIMIT 1 OFFSET $1::int`, [skip]);
              const link = ans.rowCount ? ans.rows[0].job_link : undefined;
              const html = ans.rowCount ? tmpl({
                ...ans.rows[0],
                class: cls(ans.rows[0], user),
                atime: ans.rows[0].atime?.toISOString(),
              }) : counts.total ? '<h1>All done!</h1>' : '<h1>No match</h1>';
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
              }).end(JSON.stringify({ counts, link, html }));
              break;
            case 'PUT':
              if (!url.searchParams.has('id') || !url.searchParams.has('v')) {
                res.writeHead(400).end();
                break;
              }
              const id = url.searchParams.get('id');
              const v = url.searchParams.get('v');
              if (v == 0 || v == 1)
                await client.query(`
                  UPDATE jobs
                  SET good_${user} = $1::boolean
                  WHERE job_link = $2::text`, [+v, id]);
              else if (v == 2)
                await client.query(`
                  UPDATE jobs
                  SET good_${user} = TRUE, applied_${user} = TRUE
                  WHERE job_link = $1::text`, [id]);
              else {
                res.writeHead(400).end();
                break;
              }
              res.writeHead(204).end();
              break;
            case 'DELETE':
              if (!url.searchParams.has('id')) {
                res.writeHead(400).end();
                break;
              }
              await client.query(`
                UPDATE jobs
                SET good_${user} = NULL, applied_${user} = FALSE
                WHERE job_link = $1::text
              `, [url.searchParams.get('id')]);
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
