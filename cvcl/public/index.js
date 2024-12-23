window.addEventListener('load', async () => {
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
    iframe.contentWindow.postMessage(latex);
  }

  const projsUl = document.querySelector('section#projs > ul');
  for (const proj of await (await fetch('/projs')).json()) {
    const el = document.createElement('li');
    el.innerText = proj;
    projsUl.appendChild(el);
  }
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
