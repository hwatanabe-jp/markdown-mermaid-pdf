import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const entrypoint = fileURLToPath(new URL('../scripts/generate-pdf.sh', import.meta.url));
const configFiles = ['.mermaid-config.json', '.puppeteer.json', '.mermaid.css'];
const configVariables = ['MERMAID_FILTER_MERMAID_CONFIG', 'MERMAID_FILTER_PUPPETEER_CONFIG', 'MERMAID_FILTER_MERMAID_CSS'];

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'generate-pdf-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'pandoc'), `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PANDOC_CALLS, JSON.stringify({ args,
  configs: ${JSON.stringify(configVariables)}.map((key) => process.env[key]),
}) + '\\n');
if (process.env.PANDOC_FAIL) process.exit(1);
fs.writeFileSync(args[args.indexOf('-o') + 1], 'stub pdf');
`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, '入力 文書.md'), '# Test\n');
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
    PANDOC_CALLS: path.join(dir, 'calls.jsonl') };
  for (const key of configVariables) delete env[key];
  return { dir, env };
}

function convert(context, style, overrides = {}) {
  return spawnSync('bash', [entrypoint, '入力 文書.md', '出力 文書.pdf', '--style', style], {
    cwd: context.dir, env: { ...context.env, ...overrides }, encoding: 'utf8',
  });
}

function calls(context) {
  return fs.readFileSync(context.env.PANDOC_CALLS, 'utf8').trim().split('\n').map(JSON.parse);
}

test('style defaults follow each invocation without leaving configuration files', (t) => {
  for (const styles of [['default', 'formal'], ['formal', 'default']]) {
    const context = sandbox(t);
    for (const style of styles) {
      const result = convert(context, style);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.deepEqual(calls(context).map((call) => call.configs), styles.map((style) => [
      style === 'formal' ? '/config/formal/mermaid-config.json' : '/config/.mermaid-config.json',
      '/config/.puppeteer.json', '/config/.mermaid.css',
    ]));
    for (const filename of configFiles) assert(!fs.existsSync(path.join(context.dir, filename)));
  }
});

test('workspace configuration overrides style defaults and is preserved', (t) => {
  const context = sandbox(t);
  for (const filename of configFiles) fs.writeFileSync(path.join(context.dir, filename), 'custom settings');
  for (const style of ['formal', 'default']) {
    const result = convert(context, style);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(calls(context).map((call) => call.configs), [configFiles, configFiles]);
  for (const filename of configFiles) {
    assert.equal(fs.readFileSync(path.join(context.dir, filename), 'utf8'), 'custom settings');
  }
});

test('explicit configuration paths take precedence over workspace files', (t) => {
  const context = sandbox(t);
  const values = configFiles.map((filename) => path.join(context.dir, 'custom settings', filename));
  for (const filename of configFiles) fs.writeFileSync(path.join(context.dir, filename), 'workspace settings');
  const result = convert(context, 'formal', Object.fromEntries(configVariables.map((key, i) => [key, values[i]])));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(context)[0].configs, values);
});

test('failed conversion leaves no generated configuration or PDF', (t) => {
  const context = sandbox(t);
  const result = convert(context, 'formal', { PANDOC_FAIL: '1' });
  assert.notEqual(result.status, 0);
  for (const filename of [...configFiles, '出力 文書.pdf']) {
    assert(!fs.existsSync(path.join(context.dir, filename)));
  }
});
