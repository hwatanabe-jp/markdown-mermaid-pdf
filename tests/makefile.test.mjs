import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'makefile tests-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(new URL('../Makefile', import.meta.url), path.join(dir, 'Makefile'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(new URL('../scripts/lint-image.sh', import.meta.url), path.join(dir, 'scripts/lint-image.sh'));
  fs.mkdirSync(path.join(dir, 'workspace'));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin/docker'), `#!/bin/sh
printf '%s\\0' "$@" >> "$DOCKER_ARGS_FILE"
if [ "$1 $2" = "image save" ]; then
  printf 'archive' > "$4"
  exit "\${DOCKER_SAVE_STATUS:-0}"
fi
exit "\${DOCKER_RUN_STATUS:-0}"
`, { mode: 0o755 });
  const log = path.join(dir, 'docker-args');
  return {
    dir,
    run: (...args) => spawnSync('make', ['--no-print-directory', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, INPUT: '', OUTPUT: '', TMPDIR: dir, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, DOCKER_ARGS_FILE: log },
    }),
    dockerArgs: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\0').slice(0, -1) : [],
  };
}

test('convert preserves spaces in the workspace and omits an unspecified output argument', (t) => {
  const { dir, run, dockerArgs } = sandbox(t);
  const input = '設計 詳細.md';
  fs.writeFileSync(path.join(dir, 'workspace', input), '# Example');
  const result = run('convert', `INPUT=${input}`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(dockerArgs(), ['run', '--rm', '-v', `${dir}/workspace:/workspace`, 'markdown-mermaid-pdf:latest', input]);
});

test('convert passes filenames with quotes and shell metacharacters as literal arguments', (t) => {
  const { dir, run, dockerArgs } = sandbox(t);
  const input = '設計 "詳細" `literal`.md';
  const output = "出力 '詳細' `literal`.pdf";
  fs.writeFileSync(path.join(dir, 'workspace', input), '# Example');
  const result = run('convert', `INPUT=${input}`, `OUTPUT=${output}`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(dockerArgs().slice(-2), [input, output]);
});

test('convert rejects missing input before invoking Docker', (t) => {
  const { run, dockerArgs } = sandbox(t);
  for (const args of [[], ['INPUT=missing file.md']]) {
    const result = run('convert', ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Error:/);
  }
  assert.deepEqual(dockerArgs(), []);
});

test('clean removes the generated example set and preserves other nested files', (t) => {
  const { dir, run } = sandbox(t);
  const sample = path.join(dir, 'workspace/formal-set');
  fs.mkdirSync(path.join(sample, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(sample, 'dist/result.pdf'), 'generated');
  fs.writeFileSync(path.join(sample, 'reference.pdf'), 'reference');
  fs.writeFileSync(path.join(sample, 'documents.json'), '{}');
  const result = run('clean');
  assert.equal(result.status, 0, result.stderr);
  assert(!fs.existsSync(path.join(sample, 'dist')));
  assert(fs.existsSync(path.join(sample, 'reference.pdf')));
  assert(fs.existsSync(path.join(sample, 'documents.json')));
});

test('lint-image scans an archive of the exact digest candidate with the existing failure policy', (t) => {
  const { run, dockerArgs } = sandbox(t);
  const image = `ghcr.io/example/pdf@sha256:${'a'.repeat(64)}`;
  const result = run('lint-image', `IMAGE=${image}`);
  assert.equal(result.status, 0, result.stderr);
  const args = dockerArgs();
  assert.deepEqual(args.slice(0, 3), ['image', 'save', '--output']);
  assert.equal(args[4], image);
  const archiveDir = path.dirname(args[3]);
  assert.deepEqual(args.slice(5, 9), ['run', '--rm', '-v', `${archiveDir}:/scan:ro`]);
  assert.match(args[9], /^goodwithtech\/dockle:.*@sha256:/);
  assert.deepEqual(args.slice(10), ['--exit-code', '1', '--exit-level', 'warn',
    '-i', 'CIS-DI-0001', '-i', 'DKL-DI-0006', '-ae', 'mdf', '--input', '/scan/image.tar']);
  assert(!fs.existsSync(archiveDir), 'successful scan must remove its archive');
});

test('lint-image propagates export and scan failures and removes temporary archives', (t) => {
  for (const failure of ['DOCKER_SAVE_STATUS=7', 'DOCKER_RUN_STATUS=9']) {
    const { run, dockerArgs } = sandbox(t);
    const result = run('lint-image', failure);
    assert.notEqual(result.status, 0);
    const args = dockerArgs();
    assert(!fs.existsSync(path.dirname(args[3])), 'failed scan/export must remove its archive');
    if (failure.startsWith('DOCKER_SAVE_STATUS')) {
      assert.equal(args.length, 5, 'failed export must not invoke Dockle');
    } else {
      assert(args.includes('--input'));
    }
  }
});
