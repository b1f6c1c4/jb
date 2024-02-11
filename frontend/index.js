const createLocalStoraged = (id, ob = undefined, setter = undefined) => {
  ob = ob || document.getElementById(id);
  const oldObj = window.localStorage.getItem(id);
  setter = setter || ((o, v) => { o.value = v; });
  if (typeof oldObj == 'string')
    setter(ob, oldObj);
  return ob;
};

const editor = createLocalStoraged('editor', ace.edit('editor'), (o, v) => { o.setValue(v); });

const counter = document.getElementById('counter');
const mask1 = document.getElementById('mask1');
const mask2 = document.getElementById('mask2');
const mask3 = document.getElementById('mask3');
const undo = document.getElementById('undo');
const skipper = document.getElementById('skip');
const applier = document.getElementById('applied');
const main = document.getElementById('main');

let processing;
const fetching = async (url, opt) => {
  processing = true;
  undo.disabled = true;
  applier.disabled = true;
  editor.readOnly = true;
  document.body.style.cursor = 'wait';
  const res = await fetch(url, opt);
  processing = false;
  editor.readOnly = false;
  document.body.style.cursor = '';
  return res;
};

let job_link, last_job_link;
let last_sql;
let skip = 0;
const doExecute = async () => {
  let sql = editor.getValue();
  if (last_sql !== sql) {
    window.localStorage.setItem('editor', sql);
    last_sql = sql;
    skip = 0;
  }
  sql = sql.replace(/<('(?:[^']|'')*')>/g, `
    (to_tsvector('english',
       coalesce(job_title, '') || ' '  ||
       coalesce(organization_name, '') || ' '  ||
       coalesce(location, '') || ' '  ||
       coalesce(job_function, '') || ' '  ||
       coalesce(industries, '') || ' '  ||
       coalesce(searched_keyword, '') || ' '  ||
       coalesce(job_description, '')) @@ to_tsquery($1))`);
  const headers = new Headers();
  headers.set('Content-Type', 'application/json')
  try {
    const result = await fetching(`/job?q=${encodeURIComponent(sql)}&s=${skip}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
    if (result.status !== 200)
      throw new Error(await result.text());
    const { counts: { total, proc, good, applied }, link, html } = await result.json();
    mask1.style.width = `${proc/total*100}%`;
    mask2.style.width = `${good/total*100}%`;
    mask3.style.width = `${applied/total*100}%`;
    counter.innerText = `${applied}/${good}/${proc}/${total}`;
    last_job_link = job_link;
    if (last_job_link)
      undo.disabled = false;
    main.innerHTML = html;
    job_link = link;
    if (job_link) {
      const scroller = document.querySelector('.scroller');
      scroller.focus();
      applier.disabled = false;
      if (skip !== 0)
        skipper.innerText = skip;
      else
        skipper.innerText = '';
    }
  } catch (e) {
    main.innerText = e;
    console.error(e);
  }
};

editor.setTheme('ace/theme/dawn');
editor.session.setMode('ace/mode/sql');
editor.commands.addCommands([{
  name: 'execute',
  bindKey: 'Ctrl-Enter',
  exec: doExecute,
  readOnly: false,
}, {
  name: 'execute2',
  bindKey: 'Alt-Enter',
  exec: doExecute,
  readOnly: false,
}]);

const doSave = async (v) => {
  const headers = new Headers();
  await fetching(`/job?id=${encodeURIComponent(job_link)}&v=${v}`, {
    method: 'PUT',
    headers,
    credentials: 'include',
  });
  main.innerHTML = '';
  await doExecute();
};

undo.addEventListener('click', async () => {
  await fetching(`/job?id=${encodeURIComponent(last_job_link)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  last_job_link = job_link = undefined;
  main.innerHTML = '';
  await doExecute();
});

applied.addEventListener('click', async () => {
  const headers = new Headers();
  job_link = undefined;
  await fetching(`/job?id=${encodeURIComponent(last_job_link)}&v=2`, {
    method: 'PUT',
    headers,
    credentials: 'include',
  });
  main.innerHTML = '';
  await doExecute();
});

document.addEventListener('keydown', (event) => {
  if (processing)
    return;
  switch (event.key) {
    case 'F8':
      doSave(1);
      break;
    case 'F9':
      doSave(0);
      break;
    case 'ArrowLeft':
      if (skip > 0) {
        skip--;
        doExecute();
      }
      break;
    case 'ArrowRight':
      skip++;
      doExecute();
      break;
  }
});

(async () => {
  const fields = document.getElementById('fields');
  fields.innerHTML = (await (await fetch('/fields', { credentials: 'include' })).text())
    + '<span title="Full text search">&lt;\'*\'&gt;</span>';
  let md;
  for (const sp of document.querySelectorAll('#fields span')) {
    sp.addEventListener('mousedown', (event) => { md = event.target; });
    sp.addEventListener('mouseup', (event) => {
      if (event.target !== md) return;
      editor.insert(md.innerText);
      editor.focus();
      if (md.innerText === "<'*'>") {
        editor.selection.moveCursorLeft();
        editor.selection.moveCursorLeft();
        editor.selection.clearSelection();
        editor.selection.selectLeft();
      }
    });
  }
})();
