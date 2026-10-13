// PDF/layout checks run inside the built image via scripts/smoke-test-image.sh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function command(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr.slice(-6000));
  return result.stdout;
}
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formal-layout-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(repo, 'workspace/formal-set/詳細 資料/構成 図.png'), path.join(dir, 'image.png'));
  return dir;
}
function document(position) {
  const rows = Array.from({ length: 80 }, (_, i) =>
    `| ROW${String(i + 1).padStart(3, '0')} | 日本語の説明文を含む表です。長い内容の折り返しとページをまたぐ表示を確認します。 | note |`).join('\n');
  return `---
doc-number: LAYOUT-001
title: Layout checks
date: 2026-10-14
organization: Test organization
figure-caption-position: ${position}
table-caption-position: ${position}
table-column-widths: auto
revision-history:
  - date: 2026-10-14
    description: First edition
---

# Figures

![Imagecaption](image.png){width=100px}

~~~{.mermaid caption="Mermaidcaption"}
flowchart LR
  A[Start] --> B[Finish]
~~~

# Tables

| ID | Description | Notes |
|---|---|---|
${rows}

: Longcaption

::: {.table-layout column-widths="20,30,50"}
| ID | Description | Notes |
|---|---|---|
| Fixed | 説明文です。 | 補足情報を記載します。 |

: Fixedcaption
:::
`;
}

test('PDF places image/Mermaid captions correctly and long-table caption exactly once on its first/last page', (t) => {
  const dir = sandbox(t);
  for (const position of ['top', 'bottom']) {
    fs.writeFileSync(path.join(dir, 'input.md'), document(position));
    command('bash', ['/usr/local/bin/generate-pdf.sh', 'input.md', 'output.pdf', '--style', 'formal'], dir);
    const pages = command('pdftotext', ['-layout', 'output.pdf', '-'], dir).replaceAll('‑', '-').split('\f');
    const captionPage = pages.findIndex((page) => page.includes('Longcaption'));
    const firstPage = pages.findIndex((page) => page.includes('ROW001'));
    const lastPage = pages.findIndex((page) => page.includes('ROW080'));
    assert(lastPage > firstPage, 'fixture must span multiple pages');
    assert.equal(captionPage, position === 'top' ? firstPage : lastPage);
    assert.equal(pages.join('').match(/Longcaption/g)?.length, 1);
    assert.match(pages.join(''), /表\s*2-1\s+Longcaption/);
    assert.match(pages.join(''), /表\s*2-2\s+Fixedcaption/);
    for (let page = firstPage; page <= lastPage; page++) {
      assert(pages[page].includes('Description'), 'table header must repeat');
    }
    if (position === 'bottom') {
      assert(pages[lastPage].indexOf('Longcaption') > pages[lastPage].indexOf('ROW080'));
    }
    command('pdftohtml', ['-xml', '-hidden', '-zoom', '1', 'output.pdf', 'layout.xml'], dir);
    const xml = fs.readFileSync(path.join(dir, 'layout.xml'), 'utf8');
    for (const [index, caption] of ['Imagecaption', 'Mermaidcaption'].entries()) {
      const page = [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)]
        .find((match) => match[1].includes(caption))?.[1];
      assert(page, `missing ${caption}`);
      const text = [...page.matchAll(/<text top="(\d+)"[^>]*>(.*?)<\/text>/g)]
        .find((match) => match[2].includes(caption));
      const images = [...page.matchAll(/<image top="(\d+)"[^>]*height="(\d+)"/g)];
      // Both figures fit on the same page in this fixture.
      const image = images[index];
      assert(image && text, `missing image/text bounds for ${caption}`);
      if (position === 'top') assert(Number(text[1]) < Number(image[1]));
      else assert(Number(text[1]) >= Number(image[1]) + Number(image[2]));
    }
  }
});

test('document-set renders layout settings and rejects invalid widths before publishing', (t) => {
  const dir = sandbox(t);
  fs.writeFileSync(path.join(dir, 'input.md'), document('bottom'));
  fs.writeFileSync(path.join(dir, 'documents.json'), JSON.stringify({ documents: [
    { id: 'layout', input: 'input.md', output: 'layout.pdf' },
  ] }));
  command('bash', ['/usr/local/bin/generate-pdf.sh', '--set', 'documents.json', 'dist'], dir);
  const text = command('pdftotext', ['-layout', 'dist/layout.pdf', '-'], dir).replaceAll('‑', '-');
  assert(text.indexOf('Longcaption') > text.indexOf('ROW080'));
  assert.match(text, /表\s*2-2\s+Fixedcaption/);
  fs.writeFileSync(path.join(dir, 'input.md'), document('bottom').replace('20,30,50', '20,30'));
  const invalid = spawnSync('bash', ['/usr/local/bin/generate-pdf.sh', '--set', 'documents.json', 'invalid'],
    { cwd: dir, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /column-widths/);
  assert(!fs.existsSync(path.join(dir, 'invalid')));
  assert(!invalid.stdout.includes('Generating PDF:'), 'preflight must fail before rendering');
});
