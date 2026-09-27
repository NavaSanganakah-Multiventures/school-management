// Which files actually ship?
//
// Walks import edges forward from the Next.js entrypoints in app/ and reports every
// source file that is unreachable. Reverse-grepping for a component's name gives the
// wrong answer, and this repo proves it twice over:
//
//   - components/screens/reset-password-screen.tsx looks like part of the abandoned
//     CRM, because it sits in the same folder as 22 dead screens. It is live:
//     app/reset/page.tsx renders it, so it is the password-reset flow real users
//     depend on.
//   - a file imported only by another dead file is itself dead, and a name-based grep
//     reports it as referenced.
//
// SCOPE IS THE NEXT.JS BUILD ONLY, AND THAT IS LOAD-BEARING.
//
// The first version of this file walked the whole repository and reported all 51
// files under api/ as dead, because nothing in app/ imports them. That was wrong and
// nearly catastrophic: api/ is the Hono Worker, bundled by wrangler/esbuild from
// api/index.ts as its entry, and it is the entire backend. It has a different
// bundler, a different entrypoint and a different life. Same for flutter_apps/,
// scripts/, db_migrations/ and the harnesses.
//
// So the analysed surface is exactly what Next.js compiles into ./out. Anything with
// its own entrypoint is excluded by name, and that exclusion is the whole reason the
// rest of the report can be trusted.
//
// This is also intended to run in CI, so that a file cannot quietly become dead (or
// quietly become live) between releases.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

// The Next.js build surface. Everything else has its own entrypoint and its own
// bundler and must not be judged by Next.js import edges.
const ANALYSED_ROOTS = ['app', 'components', 'lib', 'hooks', 'plugins'];
// Never analysed, and the reason is worth keeping visible rather than implicit.
const EXCLUDED_ROOTS = {
  api: 'Hono Worker, bundled by wrangler/esbuild from api/index.ts',
  'flutter_apps': 'Dart apps, built by Flutter',
  scripts: 'Node tooling, run directly',
  db_migrations: 'SQL applied by wrangler d1 migrations apply',
  docs: 'documentation',
  '.github': 'CI configuration',
  public: 'static assets, not imported',
};

function allFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', 'out', '.git', 'build', '.tmp-apitest'].includes(e.name)) continue;
      allFiles(f, out);
    } else if (EXTS.includes(path.extname(e.name))) out.push(f);
  }
  return out;
}

const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function resolveSpec(spec, fromFile) {
  // Only relative and @/ specs are project files. Anything bare is a package.
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.relative(ROOT, path.resolve(path.dirname(fromFile), spec)).replace(/\\/g, '/');
  else return null;

  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => base + '/index' + e)];
  for (const c of candidates) if (exists(c)) return c;
  return null;
}

const entryFiles = allFiles(path.join(ROOT, 'app'));
const all = ANALYSED_ROOTS.flatMap((d) => allFiles(path.join(ROOT, d))).filter((f) => !rel(f).startsWith('app/'));
const allSet = new Set(all.map(rel));

const importsOf = new Map();
for (const f of [...entryFiles, ...all]) {
  const src = fs.readFileSync(f, 'utf8');
  const specs = [
    ...src.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g),
    ...src.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...src.matchAll(/(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g),
  ].map((m) => m[1]);
  const resolved = new Set();
  for (const s of specs) {
    const r = resolveSpec(s, f);
    // Only follow edges that stay inside the analysed surface, so the walk cannot
    // wander into a file that was never a candidate for deletion.
    if (r && allSet.has(r)) resolved.add(r);
  }
  importsOf.set(rel(f), resolved);
}

// Forward reachability from app/.
const reachable = new Set();
const queue = entryFiles.map(rel);
while (queue.length) {
  const cur = queue.pop();
  if (reachable.has(cur)) continue;
  reachable.add(cur);
  for (const next of importsOf.get(cur) || []) {
    if (!reachable.has(next)) queue.push(next);
  }
}

const dead = all.map(rel).filter((f) => !reachable.has(f));

function sizeOf(list) {
  return list.reduce((a, f) => a + fs.statSync(path.join(ROOT, f)).size, 0);
}
function linesOf(list) {
  return list.reduce((a, f) => a + fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/).length, 0);
}

console.log('Analysed surface (Next.js only): ' + ANALYSED_ROOTS.join(', '));
console.log('Excluded on purpose:');
for (const [d, why] of Object.entries(EXCLUDED_ROOTS)) console.log('  ' + d.padEnd(16) + why);
console.log('\n  schools.json    read at build time by app/page.tsx (registry, not an import)');

const live = [...reachable].filter((f) => !f.startsWith('app/') && f !== 'schools.json').sort();
console.log('\nREACHABLE from app/ -- these ship: ' + live.length + ' files');
for (const f of live) console.log('  LIVE   ' + f);

console.log('\nUNREACHABLE (' + dead.length + ' files, ' + (sizeOf(dead) / 1024).toFixed(1) + ' KB, ' + linesOf(dead) + ' lines)');
const byDir = new Map();
for (const f of dead) {
  const d = path.dirname(f);
  if (!byDir.has(d)) byDir.set(d, []);
  byDir.get(d).push(f);
}
for (const d of [...byDir.keys()].sort()) {
  const list = byDir.get(d);
  console.log('\n  ' + d + '/  (' + list.length + ' files, ' + (sizeOf(list) / 1024).toFixed(1) + ' KB)');
  for (const f of list.sort()) console.log('    DEAD  ' + f);
}

console.log('\nNOTE: "unreachable" is a statement about the shipped bundle, not a verdict.');
console.log('A file that only the abandoned CRM imports is itself dead, but deleting the');
console.log('CRM is a product decision. This tool is here to make the size of that decision');
console.log('visible, not to make it for you.');

if (process.argv.includes('--json')) {
  fs.writeFileSync('dead-code-report.json', JSON.stringify({ reachable: live, dead }, null, 2) + '\n');
  console.log('\nwrote dead-code-report.json');
}

