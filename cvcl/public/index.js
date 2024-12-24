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

  profileSelect.addEventListener('change', (e) => {
    window.localStorage.setItem('X-Profile', e.target.value);
    window.location.reload();
  });

  const iframe = document.querySelector('iframe');

  window.addEventListener('message', (evt) => {
    loading.innerText = evt.data;
  });

  function recompile() {
    loading.innerText = 'Compiling...';
    const find = (id) => {
      const res = [...document.querySelectorAll(
        `section#${id} > div > ul:first-child > li`)]
        .map((e) => e.innerText);
      window.localStorage.setItem(id, JSON.stringify(res));
      return res;
    };
    let latex = `
\\begin{document}
\\maketitle

`;
    for (const s of find('sections')) {
      latex += s;
      latex += '\n';
      switch (s) {
        case '\\section{Skills}':
          latex += find('skills').join('\n');
          break;
        case '\\section{Education}':
          latex += find('edus').join('\n');
          break;
        case '\\section{Experiences}':
          latex += find('exps').join('\n');
          break;
        case '\\section{Projects}':
          latex += find('projs').join('\n');
          break;
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

  const profileData = await (await fetch('/profile', { headers: { 'X-Profile': profile } })).json();
  if (!Array.isArray(profileData.sections))
    profileData.sections = [];
  profileData.sections.unshift(
    '\\section{Education}',
    '\\section{Skills}',
    '\\section{Experiences}',
    '\\section{Projects}');
  profileData.sections.push(
    '\\vspace{-1mm}',
    '\\vspace{-2mm}',
    '\\vspace{-3mm}',
    '\\vspace{-4mm}');
  ['sections', 'projs', 'edus', 'exps', 'skills'].map((id) => {
    const avail = document.querySelector(`section#${id} > ul`);
    const active = document.querySelector(`section#${id} > div > ul:first-child`);
    const lastS = window.localStorage.getItem(id);
    const last = lastS ? JSON.parse(lastS) : [];
    if (!profileData[id]) return;
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
  });
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

  recompile();
});
