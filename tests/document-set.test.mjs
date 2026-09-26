import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { readManifest, indexDocuments, resolveDocuments } from '../scripts/generate-document-set.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(repo, 'workspace/formal-set');
function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout;
}
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'document-set-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(fixtures, dir, {
    recursive: true,
    filter: (source) => !path.relative(fixtures, source).split(path.sep).includes('dist'),
  });
  return dir;
}
function parse(dir) {
  return readManifest(path.join(dir, 'documents.json')).map((doc) => ({ ...doc,
    ast: JSON.parse(command('pandoc', [doc.input, '-f', 'markdown', '-t', 'json',
      '-L', '/config/formal/validate.lua', '-L', '/config/formal/index.lua'])) }));
}
function collect(value, type) {
  if (Array.isArray(value)) return value.flatMap((item) => collect(item, type));
  if (!value || typeof value !== 'object') return [];
  return [...(value.t === type ? [value] : []), ...Object.values(value).flatMap((item) => collect(item, type))];
}
function edit(dir, file, change) {
  const filename = path.join(dir, file);
  fs.writeFileSync(filename, change(fs.readFileSync(filename, 'utf8')));
}
function pdfObjects(filename) {
  const pdf = fs.readFileSync(filename).toString('latin1');
  return [...pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap((match) => {
    try { return [inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')]; }
    catch { return []; } // Font/image streams need not use FlateDecode.
  }).join('\n');
}
function build(dir, output = 'dist') {
  return spawnSync('bash', ['/usr/local/bin/generate-pdf.sh', '--set',
    path.join(dir, 'documents.json'), path.join(dir, output)],
  { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

test('references, metadata list, explicit labels, nested headings, and renamed outputs follow source data', (t) => {
  const dir = sandbox(t);
  edit(dir, 'documents.json', (s) => s.replace('設計 詳細.pdf', '新版 設計.pdf'));
  edit(dir, '詳細 資料/設計.md', (s) => s.replace('# 設計 {#design}', '# 前置き\n\n本文。\n\n# 設計 {#design}'));
  const docs = parse(dir);
  indexDocuments(docs);
  resolveDocuments(docs);
  const links = collect(docs[0].ast, 'Link');
  assert(links.some((n) => n.c[2][0] === '新版 設計.pdf#docset-h3' && n.c[1][0].c === 'SET-002 設計仕様 — 2.1 構成'));
  assert(links.some((n) => n.c[1][0].c === 'SET-003 運用仕様 — 別紙 連絡先'));
  const listing = collect(docs[0].ast, 'BulletList')[0];
  assert.equal(listing.c.length, 3);
  assert.match(JSON.stringify(listing), /SET-002 設計仕様 ／ 版：1.0 ／ ドラフト/);
  assert(collect(docs[1].ast, 'Link').some((n) => n.c[1][0].c === '全体構成へ戻る'));
  assert.equal(docs[1].headings.get('components').label, '2.1 1)');
  assert.equal(docs[1].headings.get('processor').label, '2.1 1) ア');
});

test('missing documents/headings and duplicate document numbers or heading IDs fail before rendering', (t) => {
  const dir = sandbox(t);
  for (const [replacement, expected] of [['doc:missing', /unknown document/], ['doc:design#missing', /unknown heading/]]) {
    const docs = parse(dir);
    docs[0].ast.blocks.push({ t: 'Para', c: [{ t: 'Link', c: [['', [], []], [], [replacement, '']] }] });
    indexDocuments(docs);
    assert.throws(() => resolveDocuments(docs), expected);
  }
  const duplicate = parse(dir);
  duplicate[1].ast.meta['document-set-info'].c['doc-number'] = duplicate[0].ast.meta['document-set-info'].c['doc-number'];
  assert.throws(() => indexDocuments(duplicate), /duplicate doc-number/);
  const headings = parse(dir);
  headings[1].ast.blocks.push(structuredClone(headings[1].ast.blocks[0]));
  assert.throws(() => indexDocuments(headings), /ambiguous heading/);
});

test('manifest rejects collisions, path escapes, unknown fields, and wrong types', (t) => {
  const dir = sandbox(t);
  const filename = path.join(dir, 'documents.json');
  const original = fs.readFileSync(filename, 'utf8');
  for (const mutate of [
    (m) => { m.documents[1].output = m.documents[0].output; },
    (m) => { m.documents[0].output = '../outside.pdf'; },
    (m) => { m.documents[0].id = 'bad#id'; },
    (m) => { m.documents[0].input = []; },
    (m) => { m.documents[0].outpt = 'typo.pdf'; },
    (m) => { m.documents[1].input = m.documents[0].input; },
  ]) {
    const manifest = JSON.parse(original);
    mutate(manifest);
    fs.writeFileSync(filename, JSON.stringify(manifest));
    assert.throws(() => readManifest(filename));
  }
});

test('external links and local reference materials keep their authored targets', (t) => {
  const dir = sandbox(t);
  edit(dir, 'マスタ 文書.md', (s) => s + '\n[外部](https://example.com) [資料](reference.pdf)\n');
  const docs = parse(dir);
  indexDocuments(docs);
  resolveDocuments(docs);
  const targets = collect(docs[0].ast, 'Link').map((n) => n.c[2][0]);
  assert(targets.includes('https://example.com'));
  assert(targets.includes('reference.pdf'));
});

test('CLI generates three PDFs, consistent cover/list metadata and destinations, with relative images', (t) => {
  const dir = sandbox(t);
  const result = build(dir);
  assert.equal(result.status, 0, result.stderr.slice(-5000));
  const output = path.join(dir, 'dist');
  assert.equal(fs.statSync(output).mode & 0o777, 0o777 & ~process.umask());
  assert.deepEqual(fs.readdirSync(output).sort(), ['全体 構成.pdf', '設計 詳細.pdf', '運用.pdf'].sort());
  const master = command('pdftotext', [path.join(output, '全体 構成.pdf'), '-']).replaceAll('‑', '-');
  assert.match(master, /SET-002 設計仕様/);
  assert.match(master, /1\.1 構成/);
  assert.match(master, /別紙\s*連絡先/);
  assert.match(master, /版：1.0/);
  assert.match(master, /ドラフト/);
  const design = path.join(output, '設計 詳細.pdf');
  assert.match(command('pdftotext', [design, '-']).replaceAll('‑', '-'), /SET-003 運用仕様/);
  assert.match(command('pdfinfo', ['-dests', design]), /docset-h2/);
  assert.match(command('pdfimages', ['-list', design]), /image/);
  const objects = pdfObjects(path.join(output, '全体 構成.pdf'));
  assert.match(objects, /\/S\s*\/GoToR/);
  const unicodeName = 'feff' + Buffer.from('設計 詳細.pdf', 'utf16le').swap16().toString('hex');
  assert(objects.includes(`/UF<${unicodeName}>`), 'remote link must contain an actual Unicode filename');
  assert(objects.includes(`/F<${Buffer.from('設計 詳細.pdf').toString('hex')}>`), 'filename spaces must not become percent escapes');
  assert(objects.includes('/D(docset-h2)') || objects.includes(`/D<${Buffer.from('docset-h2').toString('hex')}>`),
    'remote link must name the destination');
  const repeat = build(dir);
  assert.notEqual(repeat.status, 0);
  assert.match(repeat.stderr, /already exists/);
});

test('rendering failure reports the source and does not publish a partial set', (t) => {
  const dir = sandbox(t);
  edit(dir, '詳細 資料/設計.md', (s) => s + '\n\\undefinedDocumentSetCommand\n');
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /設計.md/);
  assert(!fs.existsSync(path.join(dir, 'dist')));
  assert(!fs.readdirSync(dir).some((name) => name.startsWith('.document-set-')));
});

test('missing images and malformed metadata fail preflight without publishing output', (t) => {
  const dir = sandbox(t);
  fs.unlinkSync(path.join(dir, '詳細 資料/構成 図.png'));
  const missing = build(dir);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /設計.md: image/);
  assert(!fs.existsSync(path.join(dir, 'dist')));
  edit(dir, 'マスタ 文書.md', (s) => s.replace('version: "1.0"', 'version: [1, 2]'));
  const invalid = build(dir);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /version/);
  assert.match(invalid.stderr, /マスタ 文書.md/);
});
