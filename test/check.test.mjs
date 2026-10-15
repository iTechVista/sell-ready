import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkFolder } from '../src/check.mjs';

// Fake credentials are assembled at run time so this file never contains one.
const FAKE_STRIPE = 'sk' + '_live_' + 'x'.repeat(24);
const FAKE_GITHUB = 'gh' + 'p_' + 'a'.repeat(36);

function project(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sell-ready-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return dir;
}

const base = { 'README.md': '# Thing', LICENSE: 'MIT', 'package.json': '{}', 'src/index.js': 'export const a = 1;\n' };

test('a clean project is ready', () => {
  const dir = project(base);
  const r = checkFolder(dir);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.warnings.length, 0);
  rmSync(dir, { recursive: true });
});

test('missing README and LICENSE are errors, a missing manifest is a warning', () => {
  const dir = project({ 'index.js': 'x' });
  const r = checkFolder(dir);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('README')));
  assert.ok(r.errors.some((e) => e.includes('LICENSE')));
  assert.ok(r.warnings.some((w) => w.includes('manifest')));
  rmSync(dir, { recursive: true });
});

test('node_modules and .git are errors, dist is only a warning', () => {
  const dir = project({ ...base, 'node_modules/x/index.js': 'x', '.git/HEAD': 'ref', 'dist/app.js': 'x' });
  const r = checkFolder(dir);
  assert.ok(r.errors.some((e) => e.startsWith('node_modules/')));
  assert.ok(r.errors.some((e) => e.startsWith('.git/')));
  assert.ok(r.warnings.some((w) => w.startsWith('dist/')));
  rmSync(dir, { recursive: true });
});

test('.env is caught but .env.example is fine', () => {
  const dir = project({ ...base, '.env': 'A=1', '.env.example': 'A=' });
  const r = checkFolder(dir);
  assert.ok(r.errors.some((e) => e.includes('.env is an environment file')));
  assert.ok(!r.errors.some((e) => e.includes('.env.example')));
  rmSync(dir, { recursive: true });
});

test('secrets in source are found with file and line', () => {
  const dir = project({ ...base, 'src/pay.js': `const a = 1;\nconst k = "${FAKE_STRIPE}";\n`, 'config.yml': `token: ${FAKE_GITHUB}\n` });
  const r = checkFolder(dir);
  assert.ok(r.errors.some((e) => e.includes('Stripe live secret key in src/pay.js:2')));
  assert.ok(r.errors.some((e) => e.includes('GitHub token in config.yml:1')));
  rmSync(dir, { recursive: true });
});

test('private key files are errors', () => {
  const dir = project({ ...base, 'certs/server.pem': 'x', id_rsa: 'x' });
  const r = checkFolder(dir);
  assert.equal(r.errors.filter((e) => e.includes('private key')).length, 2);
  rmSync(dir, { recursive: true });
});

test('unfinished markers warn in source but not in docs or tests', () => {
  const dir = project({ ...base, 'src/a.js': '// TODO finish\n', 'NOTES.md': 'TODO later', 'test/a.test.js': '// TODO' });
  const r = checkFolder(dir);
  const stubs = r.warnings.filter((w) => w.startsWith('unfinished marker'));
  assert.equal(stubs.length, 1);
  assert.ok(stubs[0].includes('src/a.js:1'));
  rmSync(dir, { recursive: true });
});
