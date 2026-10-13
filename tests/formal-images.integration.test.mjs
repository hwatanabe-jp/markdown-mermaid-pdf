import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Run inside the candidate image, alongside the document-set integration tests.
const metadata = `---
doc-number: TEST-IMAGE
title: Image bounds
date: 2026-07-15
organization: Test organization
revision-history:
  - date: 2026-07-15
    description: First edition
---
`;
const labels = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
const diagrams = [
  { name: 'Tall captioned', labels: labels('Captioned', 21), direction: 'TD', caption: true },
  { name: 'Tall uncaptioned', labels: labels('Uncaptioned', 21), direction: 'TD', caption: false },
  { name: 'Wide', labels: labels('Wide', 12), direction: 'LR', caption: true },
  { name: 'Small', labels: ['SmallBegin', 'SmallEnd'], direction: 'LR', caption: true },
];
const markdown = metadata + diagrams.map((diagram) => {
  const nodes = diagram.labels.map((label, i) => `n${i}[${label}]`).join(' --> ');
  return `\n# ${diagram.name}\n\n\`\`\`{.mermaid${diagram.caption ? ` caption="${diagram.name}"` : ''}}\nflowchart ${diagram.direction}\n  ${nodes}\n\`\`\`\n\nAfter diagram.\n`;
}).join('');

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout;
}

for (const format of ['png', 'pdf']) {
  test(`formal ${format} diagrams fit A4 with and without captions`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formal-images-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const input = path.join(dir, 'images.md');
    const output = path.join(dir, 'images.pdf');
    fs.writeFileSync(input, markdown);
    const result = spawnSync('bash', ['/usr/local/bin/generate-pdf.sh', input, output, '--style', 'formal'], {
      cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, MERMAID_FILTER_FORMAT: format },
    });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    // Clipped content can disappear entirely from pdftotext, so coordinates alone are insufficient.
    assert.doesNotMatch(result.stderr, /Overfull \\[hv]box|Float too large|Missing character:/);
    assert.match(command('pdfinfo', [output]), /Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)/);

    if (format === 'png') {
      const rows = command('pdfimages', ['-list', output]).split('\n')
        .map((line) => line.trim().split(/\s+/)).filter((row) => row[2] === 'image');
      assert.equal(rows.length, diagrams.length);
      for (const row of rows) {
        const widthPx = Number(row[3]), heightPx = Number(row[4]);
        const xPpi = Number(row[12]), yPpi = Number(row[13]);
        // A4 with 28mm side margins and a 237mm body height; PPI is rounded by Poppler.
        assert(widthPx * 72 / xPpi <= 154 * 72 / 25.4 + 4, `image wider than body: ${row}`);
        assert(heightPx * 72 / yPpi <= .65 * 237 * 72 / 25.4 + 4, `image taller than limit: ${row}`);
        assert(Math.abs(xPpi - yPpi) <= 1, `aspect ratio changed: ${row}`);
      }
      // The compact diagram must not be enlarged to fill the available width or height.
      assert(Number(rows.at(-1)[12]) >= 72, 'small diagram was enlarged');
    } else {
      const bbox = command('pdftotext', ['-bbox', output, '-']);
      const pages = [...bbox.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((m) => m[1]);
      for (const diagram of diagrams) {
        const page = pages.find((body) => body.includes(`>${diagram.labels[0]}</word>`));
        assert(page, `missing first node: ${diagram.name}`);
        const words = [...page.matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)<\/word>/g)]
          .filter((m) => diagram.labels.includes(m[5]));
        assert.deepEqual(words.map((m) => m[5]).sort(), [...diagram.labels].sort(), `missing or split nodes: ${diagram.name}`);
        for (const [, x0, y0, x1, y1] of words) {
          assert(Number(x0) >= 28 * 72 / 25.4 - 1 && Number(x1) <= 182 * 72 / 25.4 + 1, 'node outside body width');
          assert(Number(y0) >= 32 * 72 / 25.4 - 1 && Number(y1) <= 269 * 72 / 25.4 + 1, 'node outside body height');
        }
      }
    }
  });
}
