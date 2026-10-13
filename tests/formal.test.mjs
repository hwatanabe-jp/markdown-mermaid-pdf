import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { indexDocuments } from '../scripts/generate-document-set.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = process.env.FORMAL_CONFIG_DIR || path.join(repo, 'config/formal');
const pandoc = process.env.PANDOC_BIN || 'pandoc';
const probe = spawnSync(pandoc, ['--version'], { encoding: 'utf8' });
const options = { skip: probe.error?.code === 'ENOENT' && 'Pandoc not found; install it or set PANDOC_BIN' };
const metadata = `---
doc-number: TEST-001
title: Test document
date: 2026-07-15
organization: Test organization
revision-history:
  - date: 2026-07-15
    description: First edition
---
`;

function convert(body, args = [], frontmatter = metadata) {
  assert.equal(probe.status, 0, probe.error?.message || probe.stderr);
  return spawnSync(pandoc, ['-f', 'markdown', '-t', 'json',
    '-L', path.join(config, 'validate.lua'), ...args],
  { input: `${frontmatter}\n${body}\n`, encoding: 'utf8' });
}

function parse(body, frontmatter = metadata) {
  const result = convert(body, ['-L', path.join(config, 'document-info.lua')], frontmatter);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const details = (count, prefix = 'detail') => Array.from({ length: count }, (_, i) =>
  `#### Detail ${i + 1} {#${prefix}-${i + 1}}`).join('\n\n');
const hierarchy = '# Chapter\n\n## Section\n\n### Item\n\n';

test('formal validates nested headings in body order and recognizes chapters inside Divs', options, () => {
  const valid = parse('::: {.wrapper}\n# Chapter\n\n## Section\n:::\n\n### Item');
  const documents = [{ id: 'test', input: 'test.md', ast: valid }];
  indexDocuments(documents);
  assert.equal(documents[0].headings.get('item').label, '1.1 1)');

  for (const [body, message] of [
    ['# Chapter\n\n::: {.wrapper}\n##### Too deep\n:::', /4階層/],
    ['# Chapter\n\n::: {.wrapper}\n### Skipped level\n:::', /階層が飛んで/],
    ['::: {.wrapper}\nText before chapter.\n\n# Chapter\n:::', /前に本文/],
    ['::: {.wrapper}\n## Missing chapter\n:::', /最初の見出しは章/],
  ]) {
    const result = convert(body);
    assert.notEqual(result.status, 0, body);
    assert.match(result.stderr, message);
  }
});

test('metadata headings do not satisfy or change body heading validation and indexing', options, () => {
  const frontmatter = metadata.replace('title: Test document', 'title: |\n  # Metadata heading');
  const ast = parse('# Body chapter', frontmatter);
  const documents = [{ id: 'test', input: 'test.md', ast }];
  indexDocuments(documents);
  assert.equal(documents[0].headings.size, 1);
  assert.equal(documents[0].headings.get('body-chapter').label, '1');
  const missing = convert('Body without a chapter.', [], frontmatter);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /番号付きの章/);
});

test('single and document-set preflight share the 20-detail limit and numbered parent resets', options, () => {
  for (const filters of [[], ['-L', path.join(config, 'document-info.lua')]]) {
    const valid = convert(hierarchy + details(20) + '\n\n#### Unnumbered {-}', filters);
    assert.equal(valid.status, 0, valid.stderr);
    const overflow = convert(hierarchy + details(20) + '\n\n::: {.wrapper}\n#### Excess\n:::', filters);
    assert.notEqual(overflow.status, 0);
    assert.match(overflow.stderr, /細目.*20件/);
    const reset = convert(hierarchy + details(20) + '\n\n### Next item\n\n' + details(20, 'next'), filters);
    assert.equal(reset.status, 0, reset.stderr);
    const unnumbered = convert(hierarchy + details(20) + '\n\n### Unnumbered item {-}\n\n#### Excess', filters);
    assert.notEqual(unnumbered.status, 0);
    assert.match(unnumbered.stderr, /細目.*20件/);
  }
});

test('document-set reference numbers follow the formal TeX numbering contract', options, () => {
  const body = hierarchy + details(20)
    + '\n\n### Unnumbered item {-}\n\n### Next item {#next-item}\n\n#### Restart {#restart}'
    + '\n\n# Next chapter {#next-chapter}\n\n## Next section {#next-section}';
  const documents = [{ id: 'test', input: 'test.md', ast: parse(body) }];
  indexDocuments(documents);
  const result = convert(body, ['-t', 'latex', '--template', path.join(config, 'template.tex'),
    '-L', path.join(config, 'format.lua')]);
  assert.equal(result.status, 0, result.stderr);
  const latex = result.stdout;
  // These macros determine visible numbering; changes must also update reference labels.
  for (const definition of [
    String.raw`\renewcommand{\thesection}{\arabic{section}}`,
    String.raw`\renewcommand{\thesubsection}{\arabic{section}.\arabic{subsection}}`,
    String.raw`\renewcommand{\thesubsubsection}{\arabic{subsubsection})}`,
    String.raw`\renewcommand{\theparagraph}{\formalkatakana{\value{paragraph}}}`,
  ]) assert(latex.includes(definition), `Missing formal numbering definition: ${definition}`);
  const kanaDefinition = latex.match(/\\newcommand\{\\formalkatakana\}[\s\S]*?\\fi\}/)?.[0];
  assert(kanaDefinition, 'formal TeX must define katakana detail numbers');
  const kana = [...kanaDefinition.matchAll(/\\or\s+([ァ-ヺ])/g)].map((match) => match[1]);
  assert.equal(kana.length, 20);
  for (const [i, character] of kana.entries()) {
    assert.equal(documents[0].headings.get(`detail-${i + 1}`).label, `1.1 1) ${character}`);
  }
  for (const [id, label] of [['next-item', '1.1 2)'], ['restart', '1.1 2) ア'],
    ['next-chapter', '2'], ['next-section', '2.1']]) {
    assert.equal(documents[0].headings.get(id).label, label);
  }
  assert.match(latex, /\\subsubsection\*\{Unnumbered item\}/);
});

const sampleTable = `| ID | Description | Notes |
|:---|:-----------:|------:|
| A | 日本語の長い説明を含む文章です。列幅の自動調整を確認します。 | note |

: Table caption`;
function withLayout(settings) {
  return metadata.replace('title: Test document', `title: Test document\n${settings}`);
}
function latex(body, settings = '') {
  const result = convert(`# Chapter\n\n${body}`, ['-t', 'latex',
    '--template', path.join(config, 'template.tex'), '-L', path.join(config, 'format.lua')],
  withLayout(settings));
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function tableSpecs(source) {
  // The template also has a fixed-width revision-history table.
  return [...source.matchAll(/\\begin\{longtable\}\{(.*)\}/g)]
    .map((match) => match[1]).filter((spec) => /0\.\d+\\linewidth/.test(spec));
}
function widths(spec) {
  return [...spec.matchAll(/([\d.]+)\\linewidth/g)].map((match) => Number(match[1]));
}

test('figure and table caption positions are independent and default to top', options, () => {
  const body = `![Figure caption](test.png)\n\n${sampleTable}`;
  for (const figure of ['top', 'bottom']) {
    for (const table of ['top', 'bottom']) {
      const source = latex(body, `figure-caption-position: ${figure}\ntable-caption-position: ${table}`);
      const image = source.indexOf('\\includegraphics', source.indexOf('\\begin{figure}'));
      const caption = source.indexOf('\\caption{Figure caption}');
      assert.equal(caption < image, figure === 'top');
      const content = source.slice(source.indexOf('\\begin{longtable}', source.indexOf('\\begin{figure}')));
      assert.equal(content.indexOf('\\caption{Table caption}') < content.indexOf('\\endfirsthead'), table === 'top');
      assert.equal(content.includes('\\endlastfoot'), table === 'bottom');
      assert.equal((content.match(/\\caption\{Table caption\}/g) || []).length, 1);
      assert(source.includes(`\\captionsetup[figure]{position=${figure},`));
      assert(source.includes(`\\captionsetup[table]{position=${table},`));
    }
  }
  assert.equal(latex(body), latex(body, 'figure-caption-position: top\ntable-caption-position: top'));
  const formatted = latex(body, 'figure-caption-position: "**bottom**"');
  assert(formatted.includes('\\captionsetup[figure]{position=bottom,'));
  assert(!formatted.includes('position=\\textbf'));
  const noCaption = latex('![](test.png)\n\n| A | B |\n|---|---|\n| a | b |',
    'figure-caption-position: bottom\ntable-caption-position: bottom');
  assert(!noCaption.includes('\\caption{'));
});

test('table ratios are normalized, scoped to one table and preserve alignment', options, () => {
  const wrapped = (value) => `::: {.table-layout column-widths="${value}"}\n${sampleTable}\n:::`;
  const source = latex(`${wrapped('20,30,50')}\n\n${sampleTable}\n\n${wrapped('default')}`,
    'table-column-widths: auto');
  const specs = tableSpecs(source);
  assert.equal(specs.length, 3);
  assert.deepEqual(widths(specs[0]), [0.2, 0.3, 0.5]);
  assert(specs[0].includes('>{\\centering\\arraybackslash}'));
  assert(specs[0].includes('>{\\raggedleft\\arraybackslash}'));
  assert.deepEqual(tableSpecs(latex(wrapped('2, 3, 5'))), [specs[0]]);
  assert.deepEqual(tableSpecs(latex(wrapped('0.2,0.3,0.5'))), [specs[0]]);
  assert.notDeepEqual(widths(specs[1]), widths(specs[0]));
  assert.equal(specs[2], tableSpecs(latex(sampleTable))[0]);
  assert.equal(latex(sampleTable), latex(sampleTable, 'table-column-widths: default'));
  assert.deepEqual(tableSpecs(latex(wrapped('auto'))), [specs[1]]);
});

test('automatic widths account for CJK text, bound outliers and handle empty cells', options, () => {
  for (const body of [sampleTable,
    '| A | B | C |\n|---|---|---|\n| x | ' + 'long'.repeat(100) + ' | z |']) {
    const values = widths(tableSpecs(latex(body, 'table-column-widths: auto'))[0]);
    assert(values[1] > values[0] && values[1] > values[2]);
    assert(values.every((v) => v >= 0.08));
    assert(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 0.000002);
  }
  const cjk = '| A | B |\n|---|---|\n| abcdef | 日本語文字列 |';
  const values = widths(tableSpecs(latex(cjk, 'table-column-widths: auto'))[0]);
  assert(values[1] > values[0], 'six CJK characters should be wider than six ASCII characters');
  const empty = '| A | B |\n|---|---|\n| | |';
  assert.deepEqual(widths(tableSpecs(latex(empty, 'table-column-widths: auto'))[0]), [0.5, 0.5]);
});

test('invalid layout settings fail in both single-document and document-set preflight', options, () => {
  const badMetadata = [
    'figure-caption-position: sideways', 'table-caption-position: false',
    'figure-caption-position: [top]', 'table-caption-position: {value: top}',
    'table-column-widths: [auto]', 'table-column-widths: 20,30,50',
  ];
  const badWidths = ['20,30', '20,30,50,10', '0,30,70', '-1,30,71', '20,,80',
    '20,30,50,', 'NaN,30,50', '1e10,30,50', '0.00001,1,1', '20,30,\\input{bad}', ''];
  for (const filters of [[], ['-L', path.join(config, 'document-info.lua')]]) {
    for (const settings of badMetadata) {
      const result = convert('# Chapter\n\n' + sampleTable, filters, withLayout(settings));
      assert.notEqual(result.status, 0, settings);
      assert.match(result.stderr, /\[formal\].*スキーマ検証エラー/s);
    }
    for (const value of badWidths) {
      const result = convert(`# Chapter\n\n::: {.table-layout column-widths="${value}"}\n${sampleTable}\n:::`, filters);
      assert.notEqual(result.status, 0, value);
      assert.match(result.stderr, /column-widths/);
    }
    for (const body of ['Text only.', `${sampleTable}\n\n${sampleTable}`]) {
      const result = convert(`# Chapter\n\n::: {.table-layout column-widths="auto"}\n${body}\n:::`, filters);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /表を1つ/);
    }
    const missing = convert(`# Chapter\n\n::: {.table-layout}\n${sampleTable}\n:::`, filters);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /column-widths/);
  }
});

test('layout survives the document-set JSON intermediate and repeated validation', options, () => {
  const frontmatter = withLayout('figure-caption-position: bottom\ntable-caption-position: bottom\ntable-column-widths: auto');
  const body = `# Chapter\n\n::: {.table-layout column-widths="20,30,50"}\n${sampleTable}\n:::`;
  const ast = parse(body, frontmatter);
  const result = spawnSync(pandoc, ['-f', 'json', '-t', 'latex',
    '-L', path.join(config, 'validate.lua'), '-L', path.join(config, 'format.lua')],
  { input: JSON.stringify(ast), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(widths(tableSpecs(result.stdout)[0]), [0.2, 0.3, 0.5]);
  assert.match(result.stdout, /\\endfoot\s+\\caption\{Table caption\}\\\\\s+\\endlastfoot/);
});
