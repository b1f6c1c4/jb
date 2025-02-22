define('ace/mode/resume_highlight_rules', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'], function(require, exports, module) {
  'use strict';
  const oop = require('../lib/oop');
  const TextHighlightRules = require('./text_highlight_rules').TextHighlightRules;

  const ResumeHighlightRules = function() {
    this.$rules = {
      start: [{
        token: ['keyword.control', 'keyword.operator', 'keyword.control', 'support.variable'],
        regex: /(^% )(edus|skills|exps|projs|lics|crss)(\s*=)(.*$)/,
      }, {
        token: 'comment.line.percentage',
        regex: /(?<!^)%.*$/,
      }, {
        token: 'comment.percentage',
        regex: /%(?!>).*$/,
      }, {
        token: ['keyword.control', 'keyword.operator'],
        regex: /(^%> )([^:]*: )/,
        next: [{
          token: 'constant.character.escape',
          regex: /\\t/,
        }, {
          token: 'keyword.operator',
          regex: /\|/,
        }, {
          token: [],
          regex: /$/,
          next: 'start',
        }, {
          defaultToken: 'support.variable',
        }],
      }, {
        token: ['keyword', 'lparen', 'variable.parameter', 'rparen', 'lparen', 'storage.type', 'rparen'],
        regex: /(\\(?:documentclass|usepackage|input))(?:(\[)([^\]]*)(\]))?({)([^}]*)(})/,
      }, {
        token: ['keyword', 'lparen', 'variable.parameter', 'rparen'],
        regex: /(\\(?:label|v?ref|cite(?:[^{]*)))(?:({)([^}]*)(}))?/,
      }, {
        token: ['storage.type', 'lparen', 'variable.parameter', 'rparen'],
        regex: /(\\(?:begin|end))({)([\w*]*)(})/,
      }, {
        token: ['keyword'],
        regex: /(?:(?![.,]).|^)[1-2][0-9][0-9][0-9][0-1][0-9][0-3][0-9](?![.,])/,
      }, {
        token: 'comment.block',
        regex: /\\iffalse/,
        next: [{
          token: 'comment.block',
          regex: /\\fi/,
        }, {
          defaultToken : 'comment.block',
        }],
      }, {
        token: 'storage.type',
        regex: /\\[a-zA-Z]+/,
      }, {
        token: 'lparen',
        regex: /[[({]/,
        }, {
          token: 'rparen',
          regex: /[\])}]/,
      }, {
        token: 'constant.character.escape',
        regex: /\\[^a-zA-Z]?/,
      }, {
        token: 'markup.bold',
        regex: /(?<=\\item )(Analyzed|Architected|Automated|Built|Created|Decreased|Designed|Developed|Implemented|Improved|Optimized|Published|Reduced|Refactored)\b/,
      }, {
        token: 'invalid.markup',
        regex: /(?<=\\item )(Aided|Assisted|Coded|Collaborated|Communicated|Executed|Exposed to|Gained experience|Helped|Participated|Programmed|Ran|Used|Utilized|Worked on)\b/,
      }, {
        token: 'invalid.deprecated',
        regex: /(?<=\\item )(Amplified|Conceptualized|Crafted|Elevated|Employed|Engaged|Engineered|Enhanced|Ensured|Fostered|Headed|Honed|Innovated|Mastered|Orchestrated|Perfected|Pioneered|Revolutionized|Spearheaded|Transformed)\b/,
      }, {
        defaultToken : 'text',
      }],
  };

  this.normalizeRules();
};

oop.inherits(ResumeHighlightRules, TextHighlightRules);

exports.ResumeHighlightRules = ResumeHighlightRules;
});

define('ace/mode/resume', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/resume_highlight_rules', 'ace/mode/behaviour/cstyle', 'ace/mode/folding/resume'], function(require, exports, module) {
  'use strict';
  const oop = require('../lib/oop');
  const TextMode = require('./text').Mode;

  const LatexHighlightRules = require('./resume_highlight_rules').ResumeHighlightRules;
  const CstyleBehaviour = require('./behaviour/cstyle').CstyleBehaviour;
  // const LatexFoldMode = require('./folding/resume').FoldMode;
  const Mode = function () {
    this.HighlightRules = LatexHighlightRules;
    // this.foldingRules = new LatexFoldMode();
    this.$behaviour = new CstyleBehaviour({ braces: true });
  };
  oop.inherits(Mode, TextMode);
  (function () {
    this.type = 'text';
    this.lineCommentStart = '%';
    this.$id = 'ace/mode/resume';
    this.getMatching = function (session, row, column) {
      if (row == undefined)
        row = session.selection.lead;
      if (typeof row == 'object') {
        column = row.column;
        row = row.row;
      }
      var startToken = session.getTokenAt(row, column);
      if (!startToken)
        return;
      if (startToken.value == '\\begin' || startToken.value == '\\end') {
        return this.foldingRules.resumeBlock(session, row, column, true);
      }
    };
  }).call(Mode.prototype);
  exports.Mode = Mode;

});
