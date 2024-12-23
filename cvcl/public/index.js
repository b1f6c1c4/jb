const profileFetch = fetch('/profiles').then((res) => res.json());

window.addEventListener('load', async () => {
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

  function recompile() {
    const find = (id) => [...document.querySelectorAll(
      `section#${id} > div > ul:first-child > li`)]
      .map((e) => e.innerText);
    let latex = `
  \\documentclass[11pt,letterpaper]{article}
  \\input{portfolio}

  \\begin{document}
  \\maketitle
  \\pagestyle{empty}
  \\thispagestyle{empty}

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
      method: 'POST',
      body: latex,
      headers: {
        'Content-Type': 'text/plain',
        'X-Profile': profile,
      }, 
    });
  }

  const profileData = await (await fetch('/profile', { headers: { 'X-Profile': profile } })).json();
  ['sections', 'projs', 'edus', 'exps', 'skills'].map((id) => {
    const ul = document.querySelector(`section#${id} > ul`);
    if (!profileData[id]) return;
    for (const obj of profileData[id]) {
      const el = document.createElement('li');
      el.innerText = obj;
      ul.appendChild(el);
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
