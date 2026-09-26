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
