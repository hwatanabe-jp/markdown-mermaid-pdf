import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readManifest, indexDocuments, resolveDocuments } from '../scripts/generate-document-set.mjs';

const str = (c) => ({ t: 'Str', c });
const link = (target, label = '') => ({ t: 'Link', c: [['', [], []], label ? [str(label)] : [], [target, '']] });
const paragraph = (...inlines) => ({ t: 'Para', c: inlines });
const heading = (level, id, title, classes = []) => ({ t: 'Header',
  c: [level, [id, classes, [['document-set-title', title]]], [str(title)]] });
function document(id, number, title, blocks) {
  return { id, input: `/documents/${id}.md`, output: `${id}.pdf`, ast: {
    'pandoc-api-version': [1, 22, 2, 1],
    meta: { 'document-set-info': { t: 'MetaMap', c: Object.fromEntries(
      Object.entries({ 'doc-number': number, title, version: '1.0', status: 'ドラフト' })
        .map(([key, c]) => [key, { t: 'MetaString', c }])) } },
    blocks,
  } };
}
function documents() {
  return [
    document('master', 'SET-001', '全体構成', [heading(1, 'master', '全体構成'),
      { t: 'Div', c: [['', ['document-list'], []], []] },
      paragraph(link('doc:design#architecture'), link('doc:operations#appendix'))]),
    document('design', 'SET-002', '設計仕様', [heading(1, 'preface', '前置き'), heading(1, 'design', '設計'),
      heading(2, 'architecture', '構成'), heading(3, 'components', '構成要素'), heading(4, 'processor', '処理部'),
      paragraph(link('doc:master', '全体構成へ戻る'))]),
    document('operations', 'SET-003', '運用仕様', [heading(1, 'operations', '運用'),
      heading(1, 'appendix', '別紙 連絡先', ['unnumbered'])]),
  ];
}
function collect(value, type) {
  if (Array.isArray(value)) return value.flatMap((item) => collect(item, type));
  if (!value || typeof value !== 'object') return [];
  return [...(value.t === type ? [value] : []), ...Object.values(value).flatMap((item) => collect(item, type))];
}
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'document-set-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('references and document lists follow indexed headings and output names', () => {
  const docs = documents();
  docs[1].output = '新版 設計.pdf';
  indexDocuments(docs);
  resolveDocuments(docs);
  const links = collect(docs[0].ast, 'Link');
  assert(links.some((n) => n.c[2][0] === '新版 設計.pdf#docset-h3'
    && n.c[1][0].c === 'SET-002 設計仕様 — 2.1 構成'));
  assert(links.some((n) => n.c[1][0].c === 'SET-003 運用仕様 — 別紙 連絡先'));
  const listing = collect(docs[0].ast, 'BulletList')[0];
  assert.equal(listing.c.length, 3);
  assert.match(JSON.stringify(listing), /SET-002 設計仕様 ／ 版：1.0 ／ ドラフト/);
  assert(collect(docs[1].ast, 'Link').some((n) => n.c[1][0].c === '全体構成へ戻る'));
  assert.equal(docs[1].headings.get('components').label, '2.1 1)');
  assert.equal(docs[1].headings.get('processor').label, '2.1 1) ア');
});

test('only body headings contribute to document destinations and numbering', () => {
  const docs = documents();
  const unused = { t: 'MetaBlocks', c: [heading(1, 'notes', '内部メモ')] };
  docs[0].ast.meta.unused = structuredClone(unused);
  indexDocuments(docs);
  assert.equal(docs[0].headings.size, 1);
  assert.deepEqual(docs[0].headings.get('master'), { label: '1', title: '全体構成', anchor: 'docset-h1' });
  assert.deepEqual(docs[0].ast.meta.unused, unused);
});

test('missing references and duplicate document numbers or heading IDs fail before rendering', () => {
  for (const [target, expected] of [['doc:missing', /unknown document/], ['doc:design#missing', /unknown heading/]]) {
    const docs = documents();
    docs[0].ast.blocks.push(paragraph(link(target)));
    indexDocuments(docs);
    assert.throws(() => resolveDocuments(docs), expected);
  }
  const duplicate = documents();
  duplicate[1].ast.meta['document-set-info'].c['doc-number'] = duplicate[0].ast.meta['document-set-info'].c['doc-number'];
  assert.throws(() => indexDocuments(duplicate), /duplicate doc-number/);
  const headings = documents();
  headings[1].ast.blocks.push(structuredClone(headings[1].ast.blocks[0]));
  assert.throws(() => indexDocuments(headings), /ambiguous heading/);
});

test('same-document references use local destinations and ordinary links keep their targets', () => {
  const docs = documents();
  docs[0].ast.blocks.push(paragraph(link('doc:master#master'), link('https://example.com'), link('reference.pdf')));
  indexDocuments(docs);
  resolveDocuments(docs);
  const links = docs[0].ast.blocks.at(-1).c;
  assert.equal(links[0].c[2][0], '#docset-h1');
  assert.equal(new Map(links[0].c[0][2]).has('document-set-file'), false);
  assert.equal(links[1].c[2][0], 'https://example.com');
  assert.equal(links[2].c[2][0], 'reference.pdf');
});

test('manifest resolves input paths and rejects collisions, path escapes, unknown fields, and wrong types', (t) => {
  const dir = sandbox(t);
  const filename = path.join(dir, 'documents.json');
  const original = { documents: ['master', 'design'].map((id) => ({ id, input: `${id}.md`, output: `${id}.pdf` })) };
  for (const doc of original.documents) fs.writeFileSync(path.join(dir, doc.input), '');
  fs.writeFileSync(filename, JSON.stringify(original));
  assert.equal(readManifest(filename)[0].input, fs.realpathSync(path.join(dir, 'master.md')));
  for (const mutate of [
    (m) => { m.documents[1].output = m.documents[0].output; },
    (m) => { m.documents[0].output = '../outside.pdf'; },
    (m) => { m.documents[0].id = 'bad#id'; },
    (m) => { m.documents[0].input = []; },
    (m) => { m.documents[0].outpt = 'typo.pdf'; },
    (m) => { m.documents[1].input = m.documents[0].input; },
  ]) {
    const manifest = structuredClone(original);
    mutate(manifest);
    fs.writeFileSync(filename, JSON.stringify(manifest));
    assert.throws(() => readManifest(filename));
  }
});

test('local images resolve beside their Markdown source and missing files fail preflight', (t) => {
  const dir = sandbox(t);
  const image = path.join(dir, '構成 図.png');
  fs.writeFileSync(image, 'image fixture');
  const docs = documents();
  docs[0].input = path.join(dir, 'master.md');
  docs[0].ast.blocks.push(paragraph({ t: 'Image', c: [['', [], []], [], ['構成%20図.png', '']] }));
  indexDocuments(docs);
  resolveDocuments(docs);
  assert.equal(collect(docs[0].ast, 'Image')[0].c[2][0], image);
  fs.unlinkSync(image);
  assert.throws(() => resolveDocuments(docs), /master\.md: image/);
});
