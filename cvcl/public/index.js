const profileFetch = fetch('/profile/').then((res) => res.json());

window.addEventListener('load', async () => {
  const loading = document.querySelector('#loading');
  const profileSelect = document.querySelector('select');
  let profile = window.localStorage.getItem('X-Profile');
  const profiles = await profileFetch;
  if (!profiles.includes(profile)) {
    profile = profiles[0];
    window.localStorage.setItem('X-Profile', profile);
  }
  for (const p of profiles) {
    const el = document.createElement('option');
    el.value = p;
    el.innerText = p;
    if (p === profile) {
      el.setAttribute('selected', 'selected');
    }
    profileSelect.appendChild(el);
  }
  const profileData = await (await fetch(`/profile/${profile}/entries`)).json();
  if (!Array.isArray(profileData.sections))
    profileData.sections = [];
  profileData.sections.unshift(...Object.keys(profileData.knownSections));
  profileData.sections.push(
    '\\vspace{-1mm}',
    '\\vspace{-2mm}',
    '\\vspace{-3mm}',
    '\\vspace{-4mm}');

  profileSelect.addEventListener('change', (e) => {
    if (e.target.value === 'new') {
      const fn = prompt('Name of the new profile? Must end with .tex');
      if (fn && fn.endsWith('.tex')) {
        profile = fn;
        const el = document.createElement('option');
        el.value = fn;
        el.innerText = fn;
        el.setAttribute('selected', 'selected');
        profileSelect.appendChild(el);
        window.localStorage.setItem('X-Profile', fn);
        startEdit();
      } else {
        e.target.value = profile;
      }
    } else {
      window.localStorage.setItem('X-Profile', e.target.value);
      window.location.reload();
    }
  });

  document.querySelector('#refresh').addEventListener('click', recompile);
  document.querySelector('#code').addEventListener('click', () => {
    recompile(true);
    window.open(`/profile/${profile}/code?` + new URLSearchParams({ latex }), '_blank');
  });
  const iframe = document.querySelector('iframe');

  let latex;
  function recompile(noshow) {
    loading.innerText = 'Preprocessing...';
    const find = (id) => {
      const res = [...document.querySelectorAll(
        `section#${id} > div > ul:first-child > li`)]
        .map((e) => e.innerText);
      window.localStorage.setItem(id, JSON.stringify(res));
      return res;
    };
    latex = '';
    for (const s of find('sections')) {
      latex += s;
      latex += '\n';
      if (s in profileData.knownSections) {
        latex += find(profileData.knownSections[s]).join('\n');
        const m = s.match(/^\\begin\{(?<env>[^}]+)\}/);
        if (m) {
          latex += `\n\\end{${m.groups.env}}\n`;
        }
      }
      latex += '\n';
    }
    latex += '\\end{document}';
    if (noshow === true) {
      return;
    }
    iframe.contentWindow.postMessage({
      url: `/profile/${profile}/pdf?` + new URLSearchParams({ latex }),
      method: 'GET',
    });
  }

  async function editTarget(params) {
    const resp = await fetch(`/profile/${profile}/edit?` + new URLSearchParams({
      ...params,
      latex,
    }));
    if (!resp.ok)
      return;
    const ln = +await resp.text();
    if (!ln)
      return;
    startEdit(ln);
  }

  let asideOpen = true;
  window.addEventListener('message', (evt) => {
    if (typeof evt.data === 'object') {
      editTarget(evt.data);
      return;
    }
    if (evt.data === true) {
      asideOpen ^= true;
      document.querySelector('aside').style.display = asideOpen ? 'initial' : 'none';
    } else {
      loading.innerText = evt.data;
    }
  });

  for (const section of document.querySelectorAll('aside section')) {
    const id = section.id;
    const avail = document.querySelector(`section#${id} > ul`);
    const active = document.querySelector(`section#${id} > div > ul:first-child`);
    const lastS = window.localStorage.getItem(id);
    let last = lastS ? JSON.parse(lastS) : [];
    if (id === 'sections' && !last.length)
      last = Object.keys(profileData.knownSections);
    if (!profileData[id].length) {
      section.style.display = 'none';
      continue;
    }
    for (const obj of profileData[id]) {
      const el = document.createElement('li');
      el.innerText = obj;
      avail.appendChild(el);
      if (last.includes(obj)) {
        el.classList.add('selected');
      }
    }
    for (const obj of last) {
      if (profileData[id].includes(obj)) {
        const ela = document.createElement('li');
        ela.innerText = obj;
        active.appendChild(ela);
      }
    }
  };
  document.querySelector('#full').addEventListener('click', () => {
    for (const section of document.querySelectorAll('section')) {
      const avail = section.querySelector('ul:nth-child(2)');
      const active = section.querySelector('div > ul:first-child');
      for (const el of active.querySelectorAll('li') ?? [])
        active.removeChild(el);
      for (const el of avail.querySelectorAll('li') ?? []) {
        if (el.innerText.startsWith('\\vspace')) {
          el.classList.remove('selected');
        } else {
          el.classList.add('selected');
          const e = document.createElement('li');
          e.innerText = el.innerText;
          active.appendChild(e);
        }
      }
    }
    recompile();
  });
  for (const section of document.querySelectorAll('section')) {
    const avail = section.querySelector('ul:nth-child(2)');
    const active = section.querySelector('div > ul:first-child');
    const discard = section.querySelector('div > ul:last-child');
    discard.addEventListener('mousedown', () => {
      for (const el of active.querySelectorAll('li.sortable-selected') ?? []) {
        for (const e of avail.querySelectorAll('li') ?? [])
          if (e.innerText === el.innerText)
            e.classList.remove('selected');
        active.removeChild(el);
      }
      recompile();
    });
    discard.addEventListener('dblclick', () => {
      for (const el of active.querySelectorAll('li') ?? [])
        active.removeChild(el);
      for (const el of avail.querySelectorAll('li') ?? [])
        el.classList.remove('selected');
      recompile();
    });
    Sortable.create(avail, {
      multiDrag: true,
      group: {
        name: section.id,
        pull: 'clone',
        put: false,
      },
      sort: false,
      fallbackTolerance: 3,
      filter: '.selected',
      onClone: (evt) => {
        if (evt.clones.length) {
          evt.clones.map((c) => c.classList.add('selected'));
        } else {
          evt.clone.classList.add('selected');
        }
      },
    });
    Sortable.create(active, {
      multiDrag: true,
      group: {
        name: section.id,
      },
      animation: 150,
      fallbackTolerance: 3,
      onSort: recompile,
    });
    Sortable.create(discard, {
      group: {
        name: section.id,
        pull: false,
      },
      animation: 150,
      onAdd: () => {
        for (const el of discard.querySelectorAll('li') ?? []) {
          for (const e of avail.querySelectorAll('li') ?? [])
            if (e.innerText === el.innerText)
              e.classList.remove('selected');
          discard.removeChild(el);
        }
      },
    });
  }

  const handleAuto = async (id, jd) => {
    loading.innerText = 'Analyzing...';
    const resp = await fetch(`/profile/${profile}/${id}`, {
      method: 'POST',
      body: jd,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    if (!resp.ok) {
      loading.innerText = 'Errored!';
      return;
    }
    loading.innerText = 'Downloading...';
    const answer = await resp.json();
    for (const el of document.querySelectorAll(`section#${id} > ul:nth-child(2) > li`)) {
      el.classList.remove('selected');
      if (answer.includes(el.innerText))
        el.classList.add('selected');
    }
    const active = document.querySelector(`section#${id} > div > ul:first-child`);
    active.innerHTML = '';
    for (const obj of answer) {
      const el = document.createElement('li');
      el.innerText = obj;
      active.appendChild(el);
    }
    if (!answer.length) {
      loading.innerText = 'No recommendation';
    } else {
      loading.innerText = '';
    }
  }
  let jd = '';
  const getJD = () => {
    jd = prompt('Paste the job description here:', jd) ?? '';
    return jd;
  }
  const mkHandleAuto = (id, skip) => async () => {
    const jd = getJD();
    if (!jd) {
      return;
    }
    await handleAuto(id, jd);
    recompile();
  };
  async function seekAdvice(jd) {
    const resp = await fetch(`/profile/${profile}/advice?` + new URLSearchParams({
      latex,
    }), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: jd,
    });
    if (!resp.ok) return;
    const text = await resp.text();
    (function trial() {
      if (iframe.contentWindow) {
        console.log('wait');
        setTimeout(() => {
          console.log('gooo');
          iframe.contentWindow.postMessage({
            mime: resp.headers.get('content-type'),
            text,
          });
        }, 100);
      } else {
        console.log('nope');
        setTimeout(trial, 100);
      }
    })();
  }
  document.getElementById('auto').addEventListener('click', async () => {
    const jd = getJD();
    if (!jd) {
      return;
    }
    await Promise.all([
      handleAuto('edus', jd),
      handleAuto('exps', jd),
      handleAuto('projs', jd),
      handleAuto('crss', jd),
      handleAuto('lics', jd),
    ]);
    recompile();
    seekAdvice(jd);
  });
  document.getElementById('advice').addEventListener('click', () => {
    const jd = getJD();
    if (!jd) {
      return;
    }
    seekAdvice(jd);
  });
  document.getElementById('auto_edus').addEventListener('click', mkHandleAuto('edus'));
  document.getElementById('auto_exps').addEventListener('click', mkHandleAuto('exps'));
  document.getElementById('auto_projs').addEventListener('click', mkHandleAuto('projs'));
  document.getElementById('auto_crss').addEventListener('click', mkHandleAuto('crss'));
  document.getElementById('auto_lics').addEventListener('click', mkHandleAuto('lics'));

  document.querySelectorAll('section ul').forEach(el => el.addEventListener('dblclick', (evt) => {
    if (evt.target.tagName === 'LI') {
      editTarget({ target: evt.target.innerText });
    }
  }));

  recompile();

  const editor = ace.edit('editor');
  window.editor = editor;
  editor.setKeyboardHandler('ace/keyboard/vim');
  editor.session.setMode('ace/mode/latex');
  editor.renderer.setShowGutter(false);
  document.querySelector('#edit').addEventListener('click', startEdit);
  document.querySelector('#llm').addEventListener('click', revise);

  let dirty = false;
  async function saveEdit() {
    if (editor.getReadOnly(true))
      return;
    const body = editor.getValue();
    if (body.length < 30) {
      if (!confirm('are you sure?')) {
        return;
      }
    }
    const resp = await fetch(`/profile/${profile}/`, {
      method: 'PUT',
      body,
    });
    if (!resp.ok) {
      alert(resp.status);
      throw new Error(await resp.text());
    }
    dirty = true;
    recompile();
  }
  function stopEdit() {
    if (dirty) {
      window.location.reload();
    } else {
      editor.setValue('');
      editor.setReadOnly(true);
      document.querySelector('aside > div').scrollTo(0, 0);
      document.querySelector('#llm').style.display = 'none';
    }
  }
  async function startEdit(ln) {
    const vimApi = window.require('ace/keyboard/vim').Vim;
    vimApi.defineEx('write', 'w', function () {
      saveEdit();
    });
    vimApi.defineEx('quit', 'q', stopEdit);
    vimApi.defineEx('wq', 'wq', function () {
      saveEdit().then(stopEdit);
    });
    const resp = await fetch(`/profile/${profile}/`);
    let txt;
    if (resp.ok)
      txt = await resp.text();
    else if (resp.status === 404)
      txt = `\\documentclass{article}

% Specify default sections:
% edus   = \\section{Education}   % <- \\def\\edXXXX
% exps   = \\section{Experience}  % <- \\def\\eXXXX
% skills = \\section{Skills}      % <- \\def\\sXXXX
% lics   = \\section{Licenses}    % <- \\def\\lcXXXX
% crss   = \\section{Courses}     % <- \\def\\crsXXXX

% For extra sections:
% \\sectionXXXX

% Note: If default sections are environments, \\end will be added automatically.
%       However, extra sections must not be environments.

%>>>>>>>>>>>
% Insert barcodes here:
%> head: text|text|text
%>>>>>>>>>>>

% Keep this:
\\begin{document}
`;
    else
      txt = resp.text();
    editor.setValue(txt, -1);
    if (typeof ln === 'number')
      editor.gotoLine(ln);
    editor.focus();
    editor.setReadOnly(false);
    document.querySelector('aside > div').scrollTo(0, 1e30);
    document.querySelector('#llm').style.removeProperty('display');
  }
  async function revise() {
    const doc = editor.getSelectedText();
    if (!doc) {
      alert('Select text first');
      return;
    }
    const adj = prompt('You want LLM to do what for you?', 'make it better suited for resume');
    if (!adj) {
      return;
    }
    const resp = await fetch('/revise', {
      method: 'POST',
      body: JSON.stringify({ adj, doc }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (resp.ok)
      editor.insert(await resp.text());
    else
      alert(resp.status + ':' + await resp.text());
  }

  setSplit({ clientX: window.localStorage.getItem('width') || 140 });
  function setSplit(e) {
    const w = e.clientX < 140 ? '140px' : `${e.clientX}px`;
    document.querySelector('aside').style.width = w;
    document.querySelector('aside').style.minWidth = w;
    document.querySelector('aside').style.maxWidth = w;
    window.localStorage.setItem('width', e.clientX);
  }
  document.querySelector('#splitter').addEventListener('mousedown', (e) => {
    e.preventDefault();
    iframe.style.pointerEvents = 'none';
    document.addEventListener('mousemove', setSplit);
    document.addEventListener('mouseup', () => {
      iframe.style.removeProperty('pointer-events');
      document.removeEventListener('mousemove', setSplit);
    }, { once: true });
  });

  const profileJudgements = await (await fetch(`/profile/${profile}/judgements`)).json();
  for (const kind in profileJudgements) {
    for (const el of document.querySelectorAll(`section#${kind} li`)) {
      const judgement = profileJudgements[kind][el.innerText];
      if (!judgement) continue;
      const min = Math.min(...Object.values(judgement));
      const str = JSON.stringify(judgement);
      el.setAttribute('title', str);
      el.classList.add(`judgement-${min}`);
      if (min >= 5) continue;
      let worst = '';
      for (const x in judgement)
        if (judgement[x] === min)
          worst += x;
      el.setAttribute('x-judgement-worst', worst);
      el.style.setProperty('--judgement-len', worst.length);
    }
  }
});
