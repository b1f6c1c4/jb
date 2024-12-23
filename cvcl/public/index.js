function recompile() {
  console.log('recompile');
}

window.addEventListener('load', () => {
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
});
