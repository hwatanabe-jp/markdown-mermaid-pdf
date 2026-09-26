#!/usr/bin/env node
// Document-set orchestration uses only Node builtins and the existing Pandoc pipeline.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const str = (value) => ({ t: 'Str', c: value });
const plain = (inlines) => ({ t: 'Plain', c: inlines });
const link = (label, target) => ({ t: 'Link', c: [['', [], []], [str(label)], [target, '']] });
const fail = (message) => { throw new Error(message); };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} failed (${result.status ?? result.signal})\n${result.stderr || ''}`);
  return result.stdout;
}

function walk(value, transform) {
  if (Array.isArray(value)) return value.map((item) => walk(item, transform));
  if (!value || typeof value !== 'object') return value;
  const copy = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, transform)]));
  return copy.t ? transform(copy) : copy;
}

export function readManifest(filename) {
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!manifest || !Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    fail('manifest.documents must be a nonempty array');
  }
  if (Object.keys(manifest).some((key) => key !== 'documents')) fail('unknown manifest field');
  const ids = new Set(), inputs = new Set(), outputs = new Set();
  return manifest.documents.map((entry, i) => {
    const context = `documents[${i + 1}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`${context}: expected an object`);
    if (Object.keys(entry).some((key) => !['id', 'input', 'output'].includes(key))) fail(`${context}: unknown field`);
    for (const key of ['id', 'input', 'output']) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) fail(`${context}: ${key} must be a nonempty string`);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry.id)) fail(`${context}: invalid id '${entry.id}'`);
    // A flat distribution keeps relative PDF links portable. No paths or URI delimiters.
    if (!/^[^/\\<>:"|?*#%\x00-\x1f]+\.pdf$/.test(entry.output) || entry.output.startsWith('.')) {
      fail(`${context}: output must be a plain .pdf filename`);
    }
    const input = fs.realpathSync(path.resolve(path.dirname(filename), entry.input));
    if (!fs.statSync(input).isFile()) fail(`${context}: input is not a file`);
    for (const [set, value, name] of [[ids, entry.id, 'id'], [inputs, input, 'input'],
      [outputs, entry.output.normalize('NFC').toLowerCase(), 'output']]) {
      if (set.has(value)) fail(`${context}: duplicate ${name} '${value}'`);
      set.add(value);
    }
    return { ...entry, input };
  });
}

export function indexDocuments(documents) {
  const numbers = new Set();
  const kana = [...'アイウエオカキクケコサシスセソタチツテト'];
  for (const doc of documents) {
    const info = doc.ast.meta['document-set-info']?.c;
    doc.info = Object.fromEntries(['doc-number', 'title', 'version', 'status'].map((key) => [key, info?.[key]?.c || '']));
    const number = doc.info['doc-number'];
    if (!number || !doc.info.title) fail(`${doc.input}: missing document metadata`);
    if (numbers.has(number)) fail(`${doc.input}: duplicate doc-number '${number}'`);
    numbers.add(number);
    doc.headings = new Map();
    const counts = [0, 0, 0, 0];
    let sequence = 0;
    doc.ast.blocks = walk(doc.ast.blocks, (node) => {
      const attr = node.t === 'Header' ? node.c[1] : node.c?.[0];
      if (Array.isArray(attr) && typeof attr[0] === 'string' && /^docset-h\d+$/.test(attr[0])) {
        fail(`${doc.input}: id '${attr[0]}' is reserved for document-set destinations`);
      }
      if (node.t !== 'Header') return node;
      const [level, [id, classes, attrs]] = node.c;
      if (level < 1 || level > 4) fail(`${doc.input}: heading level must be 1–4`);
      if (doc.headings.has(id)) fail(`${doc.input}: ambiguous heading id '${id}'`);
      let label = '';
      if (!classes.includes('unnumbered')) {
        counts[level - 1]++;
        counts.fill(0, level);
        if (level === 4 && counts[3] > kana.length) fail(`${doc.input}: at most 20 numbered level-4 headings per item`);
        const section = `${counts[0]}.${counts[1]}`;
        const item = `${section} ${counts[2]})`;
        label = [String(counts[0]), section, item, `${item} ${kana[counts[3] - 1]}`][level - 1];
      }
      const title = new Map(attrs).get('document-set-title');
      const anchor = `docset-h${++sequence}`;
      doc.headings.set(id, { label, title, anchor });
      node.c[1][2].push(['document-set-anchor', anchor]);
      return node;
    });
  }
}

export function resolveDocuments(documents) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  for (const doc of documents) {
    const targetUrl = (target, anchor = '') => {
      if (target.id === doc.id && anchor) return `#${anchor}`;
      return target.output + (anchor ? `#${anchor}` : '');
    };
    const markFileLink = (node, target, anchor = '') => {
      if (target.id === doc.id && anchor) return node;
      // PDF file specifications are filenames, not percent-encoded URIs. Include
      // Unicode /UF as UTF-16BE so Japanese filenames work across desktop viewers.
      node.c[0][2].push(
        ['document-set-file', Buffer.from(target.output).toString('hex')],
        ['document-set-unicode-file', 'feff' + Buffer.from(target.output, 'utf16le').swap16().toString('hex')],
        ['document-set-destination', Buffer.from(anchor).toString('hex')]);
      return node;
    };
    doc.ast = walk(doc.ast, (node) => {
      if (node.t === 'Image' && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(node.c[2][0])) {
        try {
          const filename = path.resolve(path.dirname(doc.input), decodeURIComponent(node.c[2][0]));
          if (!fs.statSync(filename).isFile()) fail('not a file');
          // Pandoc 2.17's JSON/resource reader does not unescape local %20 paths.
          node.c[2][0] = filename;
        } catch (error) { fail(`${doc.input}: image '${node.c[2][0]}': ${error.message}`); }
        return node;
      }
      if (node.t === 'Div' && node.c[0][1].includes('document-list')) {
        if (node.c[1].length) fail(`${doc.input}: .document-list must be empty`);
        return { t: 'BulletList', c: documents.map((target) => {
          const info = target.info;
          const label = `${info['doc-number']} ${info.title}`
            + (info.version ? ` ／ 版：${info.version}` : '')
            + (info.status ? ` ／ ${info.status}` : '');
          return [plain([markFileLink(link(label, targetUrl(target)), target)])];
        }) };
      }
      if (node.t !== 'Link' || !node.c[2][0].startsWith('doc:')) return node;
      const original = node.c[2][0];
      const match = /^doc:([a-zA-Z0-9][a-zA-Z0-9_-]*)(?:#(.+))?$/.exec(original);
      if (!match) fail(`${doc.input}: invalid document reference '${original}'`);
      const target = byId.get(match[1]);
      if (!target) fail(`${doc.input}: unknown document '${match[1]}'`);
      let heading;
      if (match[2]) {
        let id;
        try { id = decodeURIComponent(match[2]); }
        catch { fail(`${doc.input}: invalid escaped heading '${match[2]}'`); }
        heading = target.headings.get(id);
        if (!heading) fail(`${doc.input}: unknown heading '${id}' in '${target.id}'`);
      }
      if (node.c[1].length === 0) {
        const label = `${target.info['doc-number']} ${target.info.title}`
          + (heading ? ` — ${heading.label ? heading.label + ' ' : ''}${heading.title}` : '');
        node.c[1] = [str(label)];
      }
      node.c[2][0] = targetUrl(target, heading?.anchor);
      return markFileLink(node, target, heading?.anchor);
    });
  }
}

export function generateSet(manifestPath, outputPath) {
  const manifest = path.resolve(manifestPath);
  const output = path.resolve(outputPath || path.join(path.dirname(manifest), 'dist'));
  if (fs.existsSync(output)) fail(`output directory already exists: ${output}; choose a new directory`);
  const documents = readManifest(manifest);
  for (const doc of documents) {
    try {
      doc.ast = JSON.parse(run('pandoc', [doc.input, '-f', 'markdown', '-t', 'json',
        '-L', '/config/formal/validate.lua', '-L', '/config/formal/document-info.lua']));
    } catch (error) { fail(`${doc.input}: ${error.message}`); }
  }
  indexDocuments(documents);
  resolveDocuments(documents);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(output), '.document-set-'));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'document-set-'));
  try {
    for (const [i, doc] of documents.entries()) {
      const input = path.join(temporary, `${i}.json`);
      fs.writeFileSync(input, JSON.stringify(doc.ast));
      console.log(`[document-set] ${doc.input} -> ${doc.output}`);
      try {
        run('bash', [path.join(scriptDir, 'generate-pdf.sh'), input, path.join(staging, doc.output),
          '--style', 'formal', '--resource-path', `${path.dirname(doc.input)}${path.delimiter}${process.cwd()}`],
        { stdio: 'inherit' });
      } catch (error) { fail(`${doc.input}: ${error.message}`); }
    }
    // Publish only a complete set; never overwrite an existing distribution.
    if (fs.existsSync(output)) fail(`output directory appeared during generation: ${output}`);
    fs.chmodSync(staging, 0o777 & ~process.umask());
    fs.renameSync(staging, output);
    console.log(`[document-set] Generated ${documents.length} PDFs: ${output}`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4) fail('Usage: generate-pdf.sh --set <documents.json> [output-directory]');
    generateSet(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(`[document-set] ${error.message}`);
    process.exitCode = 1;
  }
}
