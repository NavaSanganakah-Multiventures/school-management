// Audits every showDialog in the Flutter apps for the "Cancel runs the action"
// defect: a dialog whose result is discarded, whose buttons pop() with no value,
// and whose follow-up call is not gated on the result.
//
// WHY A SOURCE AUDIT AND NOT A WIDGET TEST
//
// A widget test that taps Cancel and asserts the service was not called is the
// better check, and one now exists (super_admin_app/test/school_action_dialogs_test.dart).
// This file exists for two reasons a widget test cannot cover:
//
//   1. It runs in `npm test` and in the deploy workflow on EVERY pull request,
//      whereas `flutter test` needs a Flutter SDK and currently runs in one
//      workflow only.
//   2. It covers all three Flutter projects, not just the one with the tests.
//
// It is deliberately a shape check rather than a list of known dialogs, because a
// list goes stale on the next dialog someone writes. The shape is the defect.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['school_management_app', 'super_admin_app', 'shared'];

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    failures.push(name);
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

/** Strips comments, so a doc comment naming the defect does not trip the audit. */
function codeOf(src) {
  return src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('//');
    })
    .join('\n');
}

function dartFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // build/ holds generated copies of the same sources. Auditing those would
      // report every fix twice and, once a source file changed, report a stale
      // generated copy as still broken.
      if (e.name === 'build' || e.name === '.dart_tool' || e.name.startsWith('.')) continue;
      dartFiles(p, out);
    } else if (e.name.endsWith('.dart') && !e.name.endsWith('_test.dart')) {
      out.push(p);
    }
  }
  return out;
}

console.log('\nFlutter dialog guard\n');

const found = [];
for (const app of APPS) {
  const libDir = path.join(ROOT, 'flutter_apps', app, 'lib');
  for (const f of dartFiles(libDir)) {
    const code = codeOf(fs.readFileSync(f, 'utf8'));

    // Every showDialog in the file, with its type argument.
    for (const m of code.matchAll(/showDialog<([^>]+)>\s*\(/g)) {
      const ret = m[1].trim();
      const start = m.index;
      const line = code.slice(0, start).split('\n').length;

      // A void result is unusable by definition: the caller has nothing to branch
      // on, so any action after the dialog is unconditional.
      if (ret === 'void') {
        // Confirm the action really is unconditional: look for a mounted check
        // WITHOUT a result check between the dialog and the next call.
        const after = code.slice(start, start + 6000);
        const guard = after.match(/\n\s*if \(([^)]*)\) return;/);
        const gated = guard && /confirmed|ok|result|saved|value|dateStr|extended/i.test(guard[1]);
        if (guard && !gated) {
          found.push({
            file: path.relative(ROOT, f),
            line,
            ret,
            why: 'dialog returns void and the guard after it checks only context.mounted',
          });
        }
      }
    }

    // A bare pop() inside a dialog whose result is used is the second half of the
    // defect: the value never reaches the caller, so the guard can never be true.
    // Counted only where the surrounding dialog is NOT already returning a value.
    const barePops = (code.match(/Navigator\.of\((ctx|context)\)\.pop\(\)/g) || []).length;
    if (barePops > 0) {
      // Cross-check: does the file bind a dialog result at all? If it does, the
      // bare pops belong to a different dialog (an action sheet, say) and are fine.
      const bindsResults = /final\s+\w+\s*=\s*await\s+showDialog</.test(code);
      if (!bindsResults) {
        found.push({
          file: path.relative(ROOT, f),
          line: 0,
          ret: '-',
          why: barePops + ' bare Navigator.pop() and no dialog result is ever bound',
        });
      }
    }
  }
}

check(
  'no dialog runs its action when the user cancels',
  found.length === 0,
  found.map((f) => f.file + ':' + f.line + ' -- ' + f.why).join(' | '),
);

if (found.length) {
  console.log('');
  for (const f of found) console.log('    ' + f.file + ':' + f.line + '  ' + f.why);
}

// The positive case, so the audit is not satisfied by a file that removed its
// dialogs entirely. confirmDialog is the pattern the rest of the file uses.
const appUi = fs.readFileSync(
  path.join(ROOT, 'flutter_apps', 'super_admin_app', 'lib', 'widgets', 'app_ui.dart'),
  'utf8',
);
check('confirmDialog returns a real bool', /Future<bool> confirmDialog/.test(appUi));
check('confirmDialog pops false on cancel and true on confirm',
  /pop\(false\)/.test(appUi) && /pop\(true\)/.test(appUi));
check('confirmDialog treats a dismissed dialog as not-confirmed', /return result == true/.test(appUi));

// Every mutating action in the fixed file must be behind a result check.
const actionsPath = path.join(ROOT, 'flutter_apps', 'super_admin_app', 'lib', 'screens', 'school_actions.dart');
const actions = fs.readFileSync(actionsPath, 'utf8');
for (const [label, needle] of [
  ['approveSchool', 'service.approveSchool('],
  ['updateSchool', 'service.updateSchool('],
  ['changePlan', 'service.changePlan('],
  ['saveEmailConfig', 'service.saveEmailConfig('],
  ['sendPaymentLink', 'service.sendPaymentLink('],
  ['notifySchool', 'service.notifySchool('],
  ['provisionSchool', 'service.provisionSchool('],
]) {
  const at = actions.indexOf(needle);
  if (at === -1) {
    check('action ' + label + ' is present', false, 'not found -- has the service changed?');
    continue;
  }
  // Walk backwards to the guard that precedes this call.
  const before = actions.slice(Math.max(0, at - 400), at);
  const guard = before.match(/if \(([^)]*)\) return;/g);
  const last = guard && guard[guard.length - 1];
  check('action ' + label + ' is gated on a dialog result',
    !!last && /confirmed\s*!=\s*true/.test(last),
    'nearest guard was: ' + (last || 'NONE'));
}

// And a widget test must exist that taps Cancel, so the behaviour is covered by
// something that actually runs the widget rather than by a source pattern.
const testPath = path.join(ROOT, 'flutter_apps', 'super_admin_app', 'test', 'school_action_dialogs_test.dart');
check('a widget test covers the Cancel behaviour', fs.existsSync(testPath));

console.log('\n' + '-'.repeat(60));
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' dialog-guard checks passed.');
