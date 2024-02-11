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
const main = document.getElementById('main');
let job_link, last_job_link;
const doExecute = async () => {
  let sql = editor.getValue();
  window.localStorage.setItem('editor', sql);
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
    const result = await fetch(`/job?q=${encodeURIComponent(sql)}`, {
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
    job_link = link;
    main.innerHTML = html;
    const scroller = document.querySelector('.scroller');
    scroller && scroller.focus();
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
  readOnly: true,
}]);

const doSave = async (v) => {
  const headers = new Headers();
  await fetch(`/job?id=${encodeURIComponent(job_link)}&v=${v}`, {
    method: 'PUT',
    headers,
    credentials: 'include',
  });
  main.innerHTML = '';
  await doExecute();
};

const doUnsave = async () => {
  const headers = new Headers();
  await fetch(`/job?id=${encodeURIComponent(job_link)}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  main.innerHTML = '';
  await doExecute();
};

document.addEventListener('keydown', (event) => {
  switch (event.key) {
    case 'F8':
      job_link = last_job_link;
      doUnsave();
      break;
    case 'F8':
      doSave(1);
      break;
    case 'F9':
      doSave(0);
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
