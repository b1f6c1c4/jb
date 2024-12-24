const profileFetch = fetch('/profiles').then((res) => res.json());

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
  const profileData = await (await fetch('/profile', { headers: { 'X-Profile': profile } })).json();
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
        window.localStorage.setItem('X-Profile', fn);
        window.location.href = '/edit.html';
      } else {
        e.target.value = profile;
      }
    } else {
      window.localStorage.setItem('X-Profile', e.target.value);
      window.location.reload();
    }
  });

  document.querySelector('#refresh').addEventListener('click', recompile);
  const iframe = document.querySelector('iframe');

  let asideOpen = true;
  window.addEventListener('message', (evt) => {
    if (evt.data === true) {
      asideOpen ^= true;
      document.querySelector('aside').style.display = asideOpen ? 'initial' : 'none';
    } else {
      loading.innerText = evt.data;
    }
  });

  function recompile() {
    loading.innerText = 'Preprocessing...';
    const find = (id) => {
      const res = [...document.querySelectorAll(
        `section#${id} > div > ul:first-child > li`)]
        .map((e) => e.innerText);
      window.localStorage.setItem(id, JSON.stringify(res));
      return res;
    };
    let latex = '';
    for (const s of find('sections')) {
      latex += s;
      latex += '\n';
      if (s in profileData.knownSections) {
        latex += find(profileData.knownSections[s]).join('\n');
        const m = s.match(/^\\begin\{(?<env>[^}]+)\}/);
        if (m) {
          latex += `\\end{${m.groups.env}}\n`;
        }
      }
      latex += '\n';
    }
    latex += '\\end{document}';
    iframe.contentWindow.postMessage({
      url: '/pdf?' + new URLSearchParams({ latex }),
      method: 'GET',
      headers: {
        'Content-Type': 'text/plain',
        'X-Profile': profile,
      }, 
    });
  }

  for (const section of document.querySelectorAll('aside section')) {
    const id = section.id;
    const avail = document.querySelector(`section#${id} > ul`);
    const active = document.querySelector(`section#${id} > div > ul:first-child`);
    const lastS = window.localStorage.getItem(id);
    let last = lastS ? JSON.parse(lastS) : [];
    if (id === 'sections' && !last.length)
      last = Object.keys(profileData.knownSections);
    if (!profileData[id]) {
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
  for (const section of document.querySelectorAll('section')) {
    const avail = section.querySelector('ul:nth-child(2)');
    const active = section.querySelector('div > ul:first-child');
    const discard = section.querySelector('div > ul:last-child');
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
        for (const el of discard.querySelectorAll('li')) {
          for (const e of avail.querySelectorAll('li'))
            if (e.innerText === el.innerText)
              e.classList.remove('selected');
          discard.removeChild(el);
        }
      },
    });
  }

  document.getElementById('auto_projs').addEventListener('click', async () => {
    const jd = prompt('Paste the job description here:');
    if (!jd) {
      return;
    }
    loading.innerText = 'Analyzing...';
    const resp = await fetch('/projs', {
      method: 'POST',
      body: jd,
      headers: {
        'Content-Type': 'text/plain',
        'X-Profile': profile,
      },
    });
    if (!resp.ok) {
      loading.innerText = 'Errored!';
      return;
    }
    loading.innerText = 'Downloading...';
    const answer = await resp.json();
    if (!answer.length) {
      loading.innerText = 'No recommendation';
      return;
    }
    for (const el of document.querySelectorAll('section#projs > ul:nth-child(2) > li')) {
      el.classList.remove('selected');
      if (answer.includes(el.innerText))
        el.classList.add('selected');
    }
    const active = document.querySelector('section#projs > div > ul:first-child');
    active.innerHTML = '';
    for (const obj of answer) {
      const el = document.createElement('li');
      el.innerText = obj;
      active.appendChild(el);
    }
    loading.innerText = '';
  });

  recompile();
});
