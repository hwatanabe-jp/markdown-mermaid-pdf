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
\@ifundefined{r@flip}{\def\previous{0}}{\edef\previous{\getrefnumber{flip}}}
\ifnum\previous=0 \def\next{1}\else \def\next{0}\fi
\immediate\write\@auxout{\string\newlabel{flip}{{\next}{1}}}
\makeatother
~~~

Oscillating label: \ref{flip}.
`));
  const result = convert(dir, 'default');
  assert.notEqual(result.status, 0);
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
