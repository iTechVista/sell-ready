#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { checkFolder } from '../src/check.mjs';

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log('Usage: sell-ready [folder]\n\nChecks that a project folder is ready to sell or share: no secrets,\nno node_modules or .git, a README and a licence. Read-only.\nExits 0 when ready, 1 when there are problems, 2 on bad usage.');
  process.exit(0);
}

const target = path.resolve(args.find((a) => !a.startsWith('-')) || '.');
if (!existsSync(target) || !statSync(target).isDirectory()) {
  console.error(`sell-ready: ${target} is not a folder`);
  process.exit(2);
}

const r = checkFolder(target);
const mb = (r.bytes / 1048576).toFixed(1);
console.log(`Checked ${r.files} files (${mb} MB) in ${target}\n`);

for (const e of r.errors) console.log(`  ✗ ${e}`);
for (const w of r.warnings) console.log(`  ! ${w}`);
if (r.errors.length || r.warnings.length) console.log('');

if (r.ok) {
  console.log(r.warnings.length ? 'Ready, with a few things worth a look.' : 'Ready to sell.');
  console.log('List it for free at https://code.itechvista.com/sell');
  process.exit(0);
}
console.log(`Not ready: ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'} to fix first.`);
process.exit(1);
