const moment = require('moment');

const detex = (s) => s
  .replace(/\s*(?:\\\\|\n)\s*/g, ' ')
  .replace(/\\[a-z]+\{([^}])*\}/g, '$1');

function getCodes(latex) {
  const lines = [...latex.matchAll(/^%> (?<head>[^:]*): (?<text>.*)$/gm)]
    .map(({ groups: { head, text } }) => {
      if (text.match(/^20[0-9][0-9][0-2][0-9][0-3][0-9]$/)) {
        return { head, format: (f) => moment(text).format(f) + '\t' };
      } else {
        const line = { head, texts: [] };
        text.split('|').forEach((t) => {
          if (head === 'COMBO') {
            line.texts.push(` \x09\x07${t}\x0a`);
            return;
          }
          let seq = t
            .replaceAll(/(?<!\\)\\n/g, '\n')
            .replaceAll(/(?<!\\)\\r/g, '\r')
            .replaceAll(/(?<!\\)\\t/g, '\t');
          if (seq.endsWith('\t')) {
            line.texts.push(seq.substr(0, seq.length - 1));
            return;
          }
          if (seq.endsWith('\r')) {
            line.texts.push(seq.replace(/\r$/, '\n'));
            line.texts.push(seq.substr(0, seq.length - 1));
            return;
          }
          if (!seq.endsWith('\n'))
            seq += '\t';
          line.texts.push(seq);
        });
        return line;
      }
    });

  const detail = latex.match(/(?<=\n\s+\\item\s+)(?:.|\n)*?(?=\\end|\n\s+\\item|$)/g);
  if (detail) {
    lines.push({
      head: 'detail',
      texts: [detail.map((d) => '- ' + detex(d)).join('\n')],
    });
  }

  return lines;
};

function parseKind(rawPortfolio, prefix, nm, single) {
  const regex = new RegExp(`(?<=^\\\\def)\\\\${prefix}[A-Z][a-zA-z]*`, 'gm');
  let entries = rawPortfolio.match(regex);
  if (!entries) {
    return {
      entries: [],
      description: '',
      descriptions: {},
      barcodes: {},
    };
  }
  entries = [...entries];

  let description = '';
  const descriptions = {};
  const barcodes = {};

  for (const entry of entries) {
    const i = rawPortfolio.indexOf(entry) + entry.length;
    let latex;
    if (!single) {
      latex = rawPortfolio.substr(i).match(/^[\s\S]+?\n\n/m)[0];
    } else {
      latex = rawPortfolio.substr(i).match(/^.*$/m)[0];
    }
    latex = latex
      .replace(/\\par\b/g, '')
      .replace(/\\g?hhref\{[^}]*\}/, '').trim();

    descriptions[entry] = latex;
    barcodes[entry] = getCodes(latex);

    description += `---- BEGIN ${nm} \`${entry}\` ----
${latex}
---- END ${nm} \`${entry}\` ----
`;
  }

  return {
    entries,
    description,
    descriptions,
    barcodes,
  };
}

class Profile {
  constructor(file, raw) {
    this.file = file;
    this.rawPortfolio = raw;
    this.barcodes = getCodes([...raw.matchAll(/^%>>+[\s\S]+?(?=\n\n)/gm)].join('\n')),

    this.data = {
      edus: parseKind(raw, 'ed', 'CONFERRED DEGREE'),
      lics: parseKind(raw, 'lc', 'LICENSE / CERTIFICATE'),
      projs: parseKind(raw, 'p', 'PROJECT'),
      exps: parseKind(raw, 'e', 'JOB EXPERIENCE'),
      crss: parseKind(raw, 'crs', 'COURSE', true),
      skills: parseKind(raw, 's', 'SKILL LIST'),
      sections: parseKind(raw, 'section', 'MISC DATA'),
    };

    this.knownSections = {};
    for (const m of raw.matchAll(/^% (?<id>[a-z]+)\s+=\s+(?<expr>.*)$/gm)) {
      this.knownSections[m.groups.expr] = m.groups.id;
    }
  }

  getEntries() {
    const entries = {
      knownSections: this.knownSections,
    };
    for (const id in this.data) {
      entries[id] = this.data[id].entries;
    }
    return entries;
  }

  getCodes(latex) {
    const result = [{ head: 'Default', lines: this.barcodes}];
    for (const ll of latex.split('\n')) {
      for (const id in this.data) {
        const lines = this.data[id].barcodes[ll];
        if (!lines || !lines.length)
          continue;
        result.push({
          head: ll,
          lines,
        });
      }
    }
    return result;
  }

  getDescription(latex) {
    let result = '';
    for (const ll of latex.split('\n')) {
      for (const id in this.data) {
        if (ll in this.data[id].descriptions)
          result += this.data[id].descriptions[ll] + '\n\n';
      }
    }
    return result;
  }
}

module.exports = Profile;
