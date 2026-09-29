// Detects Flutter tests and packages that no CI workflow runs.
//
// WHY THIS FILE EXISTS
//
// The two highest-value harnesses in this repo -- verify-phase1-rbac and
// verify-phase2-money -- had been written, advertised in the README, referenced
// by nothing, and had never executed. A merge could invert the tier check and the
// deploy would still be green.
//
// The same thing had happened to Flutter code, in three places at once, and
// nothing in the repo could see it:
//
//   school_management_app  test/pdf_service_test.dart   8 tests, never run
//   school_management_app  test/widget_test.dart        3 tests, never run
//   shared                no test/ dir, never analyzed
//
// It cannot be caught by running the tests, because the problem is that nobody
// runs them. It has to be caught by looking at the workflows, which is all this
// does.
//
// WHAT IT CHECKS
//
//   1. Every package under flutter_apps that has a test/ directory with at least
//      one *_test.dart file is `flutter test`ed by some workflow.
//   2. Every package under flutter_apps is analyzed by some workflow.
//   3. The workflows it inspects exist. A check that passes because it matched
//      nothing is worse than no check.
//
// WHAT IT DELIBERATELY DOES NOT CHECK
//
// It does not parse the workflow to find every way a test could run. It looks for
// `flutter test` and `flutter analyze` within a step whose `cd` targets the
// package. A workflow that runs tests some other way -- a matrix, a composite
// action, a shell loop over directories -- would be reported as orphaned. That
// is a false positive to be fixed here, not a hole to be worked around silently,
// because the failure mode this file guards against is precisely a check that
// quietly stops matching.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS_DIR = path.join(ROOT, 'flutter_apps');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    failures.push(name + (detail ? '  ->  ' + detail : ''));
    console.log('  FAIL  ' + name + (detail ? '  ->  ' + detail : ''));
  }
}

console.log('\nFlutter CI coverage\n');

/** Package directories directly under flutter_apps/. */
function packages() {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'build')
    .map((e) => e.name)
    .sort();
}

/** *_test.dart files, excluding build/ and .dart_tool/ copies of the same source. */
function testFiles(pkg) {
  const dir = path.join(APPS_DIR, pkg, 'test');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('_test.dart'))
    .map((e) => path.join(pkg, 'test', e.name));
}

const workflowFiles = fs.existsSync(WORKFLOWS_DIR)
  ? fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  : [];

// Guard the guard: a check that passes because it read nothing is not a pass.
check('workflow files were found to inspect', workflowFiles.length > 0,
  'expected .github/workflows/*.yml -- has the directory moved?');

const workflows = workflowFiles.map((f) => ({
  name: f,
  text: fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'),
}));

console.log('');

/**
 * True when some workflow runs `flutter <verb>` with the working directory inside
 * `pkg`. Matches a `cd <pkg>` (or a path ending in <pkg>) anywhere in the same
 * step block as the verb.
 */
function runsInWorkflow(verb, pkg) {
  const hits = [];
  for (const wf of workflows) {
    // Split into steps so a `cd` in one step does not count for another step.
    const steps = wf.text.split(/^\s*(?=- name:|- run:|- uses:)/m);
    for (const step of steps) {
      if (!new RegExp(`flutter\\s+${verb}\\b`).test(step)) continue;
      // `cd flutter_apps/school_management_app`, `cd school_management_app`, or
      // `-C`-style `working-directory:` are all accepted.
      const cds = [
        new RegExp(`cd\\s+[^\\n]*\\b${pkg}\\b`),
        new RegExp(`working-directory:[^\\n]*\\b${pkg}\\b`),
        new RegExp(`cd\\s+[\\w./-]*/${pkg}\\b`),
      ];
      if (cds.some((re) => re.test(step))) hits.push(wf.name);
    }
  }
  return hits;
}

const pkgs = packages();
check('flutter packages were found', pkgs.length > 0, 'flutter_apps/ is empty or missing');

let totalTests = 0;
let totalTestFiles = 0;

for (const pkg of pkgs) {
  console.log('--- ' + pkg + ' ---');

  const files = testFiles(pkg);
  totalTestFiles += files.length;

  // Every *_test.dart is a test file by definition, so the package is tested if
  // it has any. Counting them is the part a "does it have tests" check misses.
  if (files.length === 0) {
    console.log('  SKIP  no test/ directory -- nothing to run');
  } else {
    const runners = runsInWorkflow('test', pkg);
    check(pkg + ': its ' + files.length + ' test file(s) are run by CI',
      runners.length > 0,
      'no workflow runs `flutter test` in ' + pkg +
        '. These files have never executed: ' + files.map((f) => path.basename(f)).join(', '));
    if (runners.length) {
      console.log('        by: ' + [...new Set(runners)].join(', '));
    }
  }

  // A package with no tests is still analyzed: shared/ held the base-URL
  // resolution that caused a login outage and was not analyzed by anything.
  const analyzers = runsInWorkflow('analyze', pkg);
  check(pkg + ': is analyzed by CI', analyzers.length > 0,
    'no workflow runs `flutter analyze` in ' + pkg);
  if (analyzers.length) {
    console.log('        by: ' + [...new Set(analyzers)].join(', '));
  }
  console.log('');
}

// Count the tests each file declares, so the summary is a number and not a claim.
for (const pkg of pkgs) {
  for (const f of testFiles(pkg)) {
    const text = fs.readFileSync(path.join(APPS_DIR, f), 'utf8');
    totalTests += (text.match(/\btest(?:Widgets)?\s*\(/g) || []).length;
  }
}

console.log('-'.repeat(64));
console.log(
  'Scanned ' + pkgs.length + ' Flutter package(s), ' + totalTestFiles +
    ' test file(s) declaring ' + totalTests + ' test(s), across ' +
    workflowFiles.length + ' workflow(s).');

if (failed) {
  console.log('\nFAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' Flutter CI-coverage checks passed.');
