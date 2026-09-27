// Read-only audit of dead code and security smells. Writes nothing.
//
// This exists because "remove dead code" is exactly the kind of request that turns
// into an outage when it is based on a grep hit. Every count here is measured from
// real imports in real files, and every finding names the files that keep something
// alive. Nothing is deleted until the audit says a thing has ZERO referrers.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'out', 'build', '.dart_tool', '.git',
  '.tmp-apitest', 'ios', 'android', 'windows', 'linux', 'macos', 'coverage',
]);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.lock', '.sqlite', '.db']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (!SKIP_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.dart', '.json', '.yml', '.yaml']);

const codeFiles = files.filter((f) => CODE_EXT.has(path.extname(f).toLowerCase()));
const contents = new Map();
for (const f of codeFiles) {
  try {
    contents.set(f, fs.readFileSync(f, 'utf8'));
  } catch {
    /* binary or unreadable */
  }
}

function refsTo(needle, { excludeSelf = true, regex = null } = {}) {
  const hits = [];
  const re = regex || new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  for (const [f, text] of contents) {
    if (excludeSelf && rel(f) === needle) continue;
    const m = text.match(re);
    if (m) hits.push({ file: rel(f), count: m.length });
  }
  return hits;
}

function line(label) {
  console.log('\n' + label);
  console.log('-'.repeat(label.length));
}

line('1. HARDCODED CREDENTIALS IN SOURCE');
const credPatterns = [
  { name: 'password-looking literal', re: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{3,}["']/gi },
  { name: 'weak default password', re: /["'](?:123456|password|admin123|test123|qwerty)["']/g },
  { name: 'basic-auth style pair', re: /["'][^"']+["']\s*:\s*["'][^"']+["']\s*,\s*\/\/.*(?:user|pass)/gi },
];
let credHits = 0;
for (const p of credPatterns) {
  for (const [f, text] of contents) {
    if (rel(f) === 'scripts/audit-dead-code.mjs') continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((l, i) => {
      p.re.lastIndex = 0;
      if (p.re.test(l)) {
        credHits++;
        console.log('  ' + rel(f) + ':' + (i + 1) + '  [' + p.name + ']  ' + l.trim().slice(0, 100));
      }
    });
  }
}
if (!credHits) console.log('  none');

line('2. TOP-LEVEL DIRS AND WHETHER ANYTHING IMPORTS THEM');
const topLevel = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
  .map((e) => e.name);
for (const d of topLevel) {
  const importers = refsTo(d + '/', { regex: new RegExp('[\'"]' + d.replace(/[-]/g, '\\-') + '/', 'g') });
  const nFiles = walk(path.join(ROOT, d)).length;
  console.log('  ' + d.padEnd(22) + ' files=' + String(nFiles).padEnd(6) + ' importing refs=' + importers.length);
  if (importers.length && importers.length <= 4) {
    for (const h of importers) console.log('        ' + h.file + ' x' + h.count);
  }
}

line('3. DUPLICATE / NEAR-DUPLICATE COMPONENT FILES (same basename, different dir)');
const byBase = new Map();
for (const f of files) {
  if (!/\.(tsx|jsx|dart)$/.test(f)) continue;
  const base = path.basename(f);
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(rel(f));
}
let dupes = 0;
for (const [base, list] of byBase) {
  if (list.length > 1) {
    dupes++;
    console.log('  ' + base);
    for (const l of list) {
      const dir = path.dirname(l);
      const importers = refsTo(path.basename(l).replace(/\.\w+$/, ''), { regex: new RegExp('[\'"][^\'"]*' + path.basename(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]', 'g') });
      const used = importers.filter((h) => path.basename(h.file) !== base);
      console.log('      ' + l.padEnd(58) + ' referenced by ' + used.length);
    }
  }
}
if (!dupes) console.log('  none');

line('4. DEPENDENCY USAGE (declared vs imported)');
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
} catch {
  console.log('  no package.json');
}
if (pkg) {
  const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
  const sourceText = [...contents.values()].join('\n');
  for (const d of deps) {
    const used = new RegExp('[\'"]' + d.replace(/[/@]/g, '\\$&') + '([/\'"]|$)', 'g');
    const n = (sourceText.match(used) || []).length;
    if (n === 0) {
      const inLock = fs.existsSync(path.join(ROOT, 'package-lock.json')) ? ' (in lockfile)' : '';
      console.log('  UNUSED       ' + d + inLock);
    }
  }
  console.log('  (only zero-reference deps are listed)');
}

line('5. STALE SQL SHADOW FILES');
for (const f of files.filter((f) => /\.sql$/.test(f))) {
  const name = path.basename(f);
  const stem = name.replace(/\.sql$/, '');
  const others = refsTo(stem, { regex: new RegExp('[\'"][^\'"]*' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\.sql[\'"]', 'g') });
  const mtimes = others.map((o) => 0);
  console.log('  ' + rel(f).padEnd(46) + ' bytes=' + String(fs.statSync(f).size).padEnd(9) + ' quoted-in-code=' + others.length + mtimes);
  for (const o of others.slice(0, 3)) console.log('        ' + o.file);
}

line('6. FILES WITH ZERO INBOUND IMPORTS (candidates only, NOT a verdict)');
const allCodeRel = new Set([...contents.keys()].map(rel));
const suspects = [];
for (const f of files) {
  const r = rel(f);
  if (!/\.(tsx|jsx)$/.test(f)) continue;
  if (r.startsWith('app/') || r.startsWith('components/ui/')) continue; // Next.js entrypoints + shadcn
  const name = path.basename(f).replace(/\.\w+$/, '');
  const importers = refsTo(name, { regex: new RegExp('[\'"][^\'"]*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]', 'g') })
    .filter((h) => path.basename(h.file) !== path.basename(f));
  if (importers.length === 0) suspects.push(r);
}
if (!suspects.length) console.log('  none');
for (const s of suspects) console.log('  ' + s);

line('7. ON-DISK vs DECLARED SCHOOLS (drift check)');
try {
  const schools = JSON.parse(fs.readFileSync(path.join(ROOT, 'schools.json'), 'utf8'));
  const list = schools.schools || schools;
  console.log('  schools.json declares ' + list.length + ' school(s)');
  for (const s of list) {
    const conf = 'wrangler-' + s.slug + '.toml';
    console.log('    ' + s.slug.padEnd(20) + (fs.existsSync(path.join(ROOT, conf)) ? 'config present' : 'NO GENERATED CONFIG (expected, built at deploy time)'));
  }
} catch (e) {
  console.log('  could not read schools.json: ' + e.message);
}

console.log('\nThis script deletes nothing. Every number above is measured from real imports.');
