// sell-ready: checks that a project folder is ready to hand to a stranger.
// Zero dependencies. Node 18 or newer.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Folders a buyer should never receive. Present means the archive is wrong. */
const NEVER_SHIP_DIRS = new Set([
  'node_modules', '.git', '.venv', 'venv', '__pycache__', '.pytest_cache',
  '.next', '.nuxt', '.turbo', '.cache', '.parcel-cache', 'coverage', '.gradle', 'Pods',
]);

/** Build output: usually wrong to ship, sometimes the product itself. */
const USUALLY_NOT_DIRS = new Set(['dist', 'build', 'out', 'target', '.dart_tool']);

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro', '.json', '.md',
  '.html', '.htm', '.css', '.scss', '.liquid', '.py', '.rb', '.php', '.go', '.rs', '.java',
  '.kt', '.kts', '.swift', '.dart', '.cs', '.c', '.cc', '.cpp', '.h', '.sh', '.ps1', '.bat',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.sql', '.txt', '.xml', '.gradle',
  '.properties', '.example', '.sample', '.template', '.env',
]);
const TEXT_NAMES = new Set(['dockerfile', 'makefile', 'procfile', 'gemfile', 'podfile']);

/** Live-credential shapes. Narrow on purpose: real keys, not the word "key". */
const SECRET_PATTERNS = [
  [/sk_live_[A-Za-z0-9]{10,}/, 'Stripe live secret key'],
  [/sk_test_[A-Za-z0-9]{10,}/, 'Stripe test secret key'],
  [/rk_live_[A-Za-z0-9]{10,}/, 'Stripe restricted key'],
  [/whsec_[A-Za-z0-9]{20,}/, 'Stripe webhook secret'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/sk-(?:proj-)?[A-Za-z0-9]{20,}/, 'OpenAI-style secret key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{40,}/, 'GitHub fine-grained token'],
  [/shpat_[a-f0-9]{32}/, 'Shopify access token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, 'JWT (often a service key)'],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/, 'private key block'],
];

// Assembled from pieces so this file does not trip its own check.
const STUB_WORDS = ['TO' + 'DO', 'FIX' + 'ME', 'X' + 'XX', 'HA' + 'CK'];
const STUB_PATTERN = new RegExp(`\\b(${STUB_WORDS.join('|')})\\b`);
const LARGE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

const isEnvFile = (name) =>
  /^\.env(\..+)?$/i.test(name) && !/\.(example|sample|template|dist)$/i.test(name);
const isKeyFile = (name) =>
  /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/.test(name) || /\.(pem|p12|pfx|key|keystore|jks)$/i.test(name);

/**
 * Checks a folder. Returns problems that should stop a sale (errors) and things
 * worth a second look (warnings). Never modifies anything.
 */
export function checkFolder(root) {
  const errors = [];
  const warnings = [];
  const files = [];
  let bytes = 0;

  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (NEVER_SHIP_DIRS.has(entry.name)) {
          errors.push(`${relPath}/ should not be shipped; buyers install or generate it themselves`);
          continue;
        }
        if (USUALLY_NOT_DIRS.has(entry.name)) {
          warnings.push(`${relPath}/ looks like build output; ship it only if it is the product`);
        }
        walk(abs, relPath);
      } else if (entry.isFile()) {
        const size = statSync(abs).size;
        files.push({ abs, relPath, name: entry.name, size });
        bytes += size;
      }
    }
  };
  walk(root, '');

  const names = new Set(files.filter((f) => !f.relPath.includes('/')).map((f) => f.name.toLowerCase()));
  const has = (re) => [...names].some((n) => re.test(n));

  if (!has(/^readme(\.(md|txt|rst))?$/)) {
    errors.push('no README at the top level; a buyer needs to know what it does and how to install it');
  }
  if (!has(/^(licen[cs]e|copying)(\.(md|txt))?$/)) {
    errors.push('no LICENSE at the top level; a buyer needs to know where they may use it');
  }
  if (!has(/^(package\.json|requirements\.txt|pyproject\.toml|pipfile|go\.mod|cargo\.toml|composer\.json|gemfile|pubspec\.yaml|pom\.xml|build\.gradle(\.kts)?|.*\.csproj)$/)) {
    warnings.push('no dependency manifest found (package.json, requirements.txt, go.mod and so on)');
  }
  if (!has(/^\.env\.(example|sample|template)$/) && files.some((f) => isEnvFile(f.name))) {
    warnings.push('add a .env.example listing each setting with a blank value, so buyers know what to configure');
  }

  for (const f of files) {
    if (isEnvFile(f.name)) errors.push(`${f.relPath} is an environment file; it usually holds real secrets`);
    if (isKeyFile(f.name)) errors.push(`${f.relPath} looks like a private key or certificate store`);
    if (f.size > LARGE_FILE_BYTES) warnings.push(`${f.relPath} is ${(f.size / 1048576).toFixed(1)} MB`);

    const ext = path.extname(f.name).toLowerCase();
    const scannable = TEXT_EXT.has(ext) || TEXT_NAMES.has(f.name.toLowerCase()) || isEnvFile(f.name);
    if (!scannable || f.size > MAX_SCAN_BYTES) continue;

    let text;
    try {
      text = readFileSync(f.abs, 'utf8');
    } catch {
      continue;
    }
    const isDocOrTest = ext === '.md' || /(^|\/)(tests?|__tests__|spec|fixtures?)\//i.test(f.relPath);
    text.split(/\r?\n/).forEach((line, i) => {
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(line)) errors.push(`possible ${label} in ${f.relPath}:${i + 1}`);
      }
      if (!isDocOrTest && STUB_PATTERN.test(line)) {
        warnings.push(`unfinished marker in ${f.relPath}:${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings, files: files.length, bytes };
}
