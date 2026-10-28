// Run inside the image via scripts/smoke-test-image.sh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-references-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function document(body) {
  return `---
doc-number: REF-001
title: Reference checks
date: 2026-10-14
organization: Test organization
toc: true
revision-history:
  - date: 2026-10-14
    description: First edition
---

${body}
`;
}

function convert(dir, style, args = ['入力 文書.md', '出力 文書.pdf', '--style', style]) {
  return spawnSync('bash', ['/usr/local/bin/generate-pdf.sh', ...args], {
    cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120_000,
  });
}

test('two-page formal TOC and page references agree with every body heading', (t) => {
  const dir = sandbox(t);
  const headings = Array.from({ length: 45 }, (_, i) => `Topic${String(i + 1).padStart(3, '0')}`);
  fs.writeFileSync(path.join(dir, '入力 文書.md'), document([
    '# Chapter',
    String.raw`FinalPageReference: \pageref{topic045}.`,
    ...headings.map((heading) => `## ${heading} {#${heading.toLowerCase()}}\n\nBody for ${heading}.`),
  ].join('\n\n')));
  const result = convert(dir, 'formal');
  assert.equal(result.status, 0, result.error?.message || result.stderr.slice(-6000));
  const extracted = spawnSync('pdftotext', ['-layout', '出力 文書.pdf', '-'], { cwd: dir, encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const pages = extracted.stdout.split('\f');
  const tocStart = pages.findIndex((page) => page.includes('目次'));
  const bodyStart = pages.findIndex((page) => page.includes('FinalPageReference:'));
  assert.equal(bodyStart - tocStart, 2, 'fixture must have exactly two TOC pages');
  const toc = pages.slice(tocStart, bodyStart).join('\n');
  for (const heading of headings) {
    const entry = toc.match(new RegExp(`${heading}[^\\n]*?([0-9]+)\\s*(?:\\n|$)`));
    assert(entry, `missing TOC entry for ${heading}`);
    const bodyPage = pages.findIndex((page, index) => index >= bodyStart && page.includes(heading));
    assert(bodyPage >= bodyStart, `missing body heading ${heading}`);
    assert.equal(Number(entry[1]), bodyPage - tocStart + 1, `wrong TOC page for ${heading}`);
  }
  const finalPage = pages.findIndex((page) => page.includes('Body for Topic045.')) - tocStart + 1;
  assert.match(pages[bodyStart], new RegExp(`FinalPageReference:\\s*${finalPage}\\.`));
});

test('formal named destinations stay on the page of every heading across page breaks', (t) => {
  const dir = sandbox(t);
  const headings = [{ title: 'テスト章', id: 'test-chapter', destination: 'section.1' }];
  const body = ['# テスト章 {#test-chapter}'];
  for (let number = 1; number <= 55; number++) {
    const suffix = String(number).padStart(2, '0');
    headings.push({ title: `テスト項目${suffix}`, id: `test-${suffix}`, destination: `subsection.1.${number}` });
    body.push(`## テスト項目${suffix} {#test-${suffix}}`,
      'これは目次と本文のページ番号を確認するための合成本文です。');
  }
  fs.writeFileSync(path.join(dir, '入力 文書.md'), document(body.join('\n\n')));
  const result = convert(dir, 'formal');
  assert.equal(result.status, 0, result.error?.message || result.stderr.slice(-6000));
  const extracted = spawnSync('pdftotext', ['-layout', '出力 文書.pdf', '-'], { cwd: dir, encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const pages = extracted.stdout.split('\f');
  const destinations = spawnSync('pdfinfo', ['-dests', '出力 文書.pdf'], { cwd: dir, encoding: 'utf8' });
  assert.equal(destinations.status, 0, destinations.stderr);
  const targets = new Map([...destinations.stdout.matchAll(/^\s*(\d+)\s+\[[^\]]+\]\s+"([^"]+)"/gm)]
    .map((match) => [match[2], Number(match[1])]));
  const bodyStart = pages.findIndex((page) => page.includes('これは目次と本文'));
  assert(bodyStart >= 4, 'fixture must have multiple TOC pages');
  assert(pages.length - bodyStart > 5, 'fixture must exercise natural page breaks');
  for (const heading of headings) {
    const page = pages.findIndex((text, index) => index >= bodyStart
      && text.replaceAll(/\s/g, '').includes(heading.title)) + 1;
    assert(page > 0, `missing heading ${heading.title}`);
    for (const target of [heading.id, heading.destination]) {
      assert.equal(targets.get(target), page, `wrong destination page for ${target}`);
    }
  }
});

test('formal document-set anchors follow nested, formatted and unnumbered headings at all four levels', (t) => {
  const dir = sandbox(t);
  const headings = [{ title: 'ChapterMarker', id: 'chapter', destination: 'section.1' },
    { title: 'SectionMarker', id: 'section', destination: 'subsection.1.1' }];
  const body = ['# ChapterMarker {#chapter}', 'Chapter body.', '## SectionMarker {#section}', 'Section body.'];
  for (let i = 1; i <= 25; i++) {
    headings.push({ title: `ItemMarker${i}End`, id: `item-${i}`, destination: `subsubsection.1.1.${i}` },
      { title: `DetailMarker${i}End`, id: `detail-${i}`, destination: `paragraph.1.1.${i}.1` });
    body.push(`### **ItemMarker${i}End** {#item-${i}}`, 'Item body.',
      `#### DetailMarker${i}End {#detail-${i}}`, 'Detail body.');
  }
  for (let level = 1; level <= 4; level++) {
    const title = `UnnumberedMarker${level}End`;
    const id = `unnumbered-${level}`;
    headings.push({ title, id, destination: `section*.${level}` });
    body.push('<!-- pagebreak -->', `${'#'.repeat(level)} ${title} {#${id} .unnumbered}`, 'Unnumbered body.');
  }
  fs.writeFileSync(path.join(dir, '入力 文書.md'), document(`::: {.wrapper}\n${body.join('\n\n')}\n:::`));
  fs.writeFileSync(path.join(dir, 'documents.json'), JSON.stringify({ documents: [
    { id: 'headings', input: '入力 文書.md', output: 'headings.pdf' },
  ] }));
  const result = convert(dir, 'formal', ['--set', 'documents.json', 'dist']);
  assert.equal(result.status, 0, result.error?.message || result.stderr.slice(-6000));
  const extracted = spawnSync('pdftotext', ['-layout', 'dist/headings.pdf', '-'], { cwd: dir, encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const pages = extracted.stdout.split('\f');
  const destinations = spawnSync('pdfinfo', ['-dests', 'dist/headings.pdf'], { cwd: dir, encoding: 'utf8' });
  assert.equal(destinations.status, 0, destinations.stderr);
  const targets = new Map([...destinations.stdout.matchAll(/^\s*(\d+)\s+\[[^\]]+\]\s+"([^"]+)"/gm)]
    .map((match) => [match[2], Number(match[1])]));
  const bodyStart = pages.findIndex((page) => page.includes('Chapter body.'));
  assert(bodyStart >= 3);
  for (const [index, heading] of headings.entries()) {
    const page = pages.findIndex((text, i) => i >= bodyStart && text.includes(heading.title)) + 1;
    assert(page > 0, `missing heading ${heading.title}`);
    for (const target of [heading.id, `docset-h${index + 1}`, heading.destination]) {
      assert.equal(targets.get(target), page, `wrong destination page for ${target}`);
    }
  }
});

for (const style of ['default', 'formal']) {
  test(`${style}: forward references resolve and undefined references fail without replacing output`, (t) => {
    const dir = sandbox(t);
    fs.writeFileSync(path.join(dir, '入力 文書.md'), document(String.raw`# Start

PageReference: \pageref{target}.

\newpage

# Target {#target}

TargetBodyMarker.
`));
    const result = convert(dir, style);
    assert.equal(result.status, 0, result.error?.message || result.stderr.slice(-6000));
    const extracted = spawnSync('pdftotext', ['-layout', '出力 文書.pdf', '-'], { cwd: dir, encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr);
    const pages = extracted.stdout.split('\f');
    const targetPage = pages.find((page) => page.includes('TargetBodyMarker.'));
    const pageNumber = targetPage?.match(/(\d+)\s*$/)?.[1];
    assert(pageNumber, 'target page must have a printed page number');
    assert.match(extracted.stdout, new RegExp(`PageReference:\\s*${pageNumber}\\.`));
    assert(!fs.readdirSync(dir).some((file) => /\.(aux|toc|log|xdv|tex|fls|fdb_latexmk)$/.test(file)),
      'intermediate files must stay out of the workspace');

    const output = path.join(dir, '出力 文書.pdf');
    const original = fs.readFileSync(output);
    fs.writeFileSync(path.join(dir, '入力 文書.md'), document(String.raw`# Missing reference

\pageref{missing-label}
`));
    const failed = convert(dir, style);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /missing-label/);
    assert(!failed.stdout.includes('Successfully generated:'));
    assert.deepEqual(fs.readFileSync(output), original, 'failed conversion must preserve the previous PDF');
    fs.unlinkSync(output);
    const fresh = convert(dir, style);
    assert.notEqual(fresh.status, 0);
    assert(!fs.existsSync(output), 'failed conversion must not publish an incomplete PDF');
  });
}

test('non-converging references fail at the rerun limit', (t) => {
  const dir = sandbox(t);
  fs.writeFileSync(path.join(dir, '入力 文書.md'), document(String.raw`# Unstable reference

~~~{=latex}
\makeatletter
\@ifundefined{r@growing}{\def\previous{}}{\edef\previous{\getrefnumber{growing}}}
% Grow the aux file on every pass: latexmk 4.79 caches checksums by size and
% second-resolution mtime, so same-length changes can be missed on fast runs.
\edef\next{\previous x}
\immediate\write\@auxout{\string\newlabel{growing}{{\next}{1}}}
\makeatother
~~~

Growing label: \ref{growing}.
`));
  const result = convert(dir, 'default');
  assert.notEqual(result.status, 0, result.error?.message || result.stderr.slice(-6000));
  assert.match(result.stderr, /Maximum runs of .* reached/);
  assert(!result.stdout.includes('Successfully generated:'));
  assert(!fs.existsSync(path.join(dir, '出力 文書.pdf')));
});

test('document-set does not publish PDFs when a LaTeX reference remains undefined', (t) => {
  const dir = sandbox(t);
  fs.writeFileSync(path.join(dir, '入力 文書.md'), document('# Good\n\nValid document.'));
  fs.writeFileSync(path.join(dir, 'invalid.md'),
    document('# Bad\n\n\\ref{missing-label}').replace('REF-001', 'REF-002'));
  fs.writeFileSync(path.join(dir, 'documents.json'), JSON.stringify({ documents: [
    { id: 'good', input: '入力 文書.md', output: 'good.pdf' },
    { id: 'bad', input: 'invalid.md', output: 'bad.pdf' },
  ] }));
  const result = convert(dir, 'formal', ['--set', 'documents.json', 'dist']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing-label/);
  assert(!fs.existsSync(path.join(dir, 'dist')));
  assert(!fs.readdirSync(dir).some((file) => file.startsWith('.document-set-')));
});
