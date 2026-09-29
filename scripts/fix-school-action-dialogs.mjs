// Repairs the "Cancel runs the action" dialogs in school_actions.dart.
//
// WHY A SCRIPT RATHER THAN TEXT EDITS
//
// The remaining dialogs could not be repaired with targeted edits because their
// buttons carry Hindi labels, which the editing path could not match reliably.
// A script operating on the UTF-8 source avoids the encoding round-trip entirely.
//
// WHAT IT CHANGES, AND HOW IT KNOWS WHAT TO CHANGE
//
// The defect has one shape: a showDialog<void> whose result is discarded, whose
// buttons both call pop() with no value, and whose action call is not gated on
// the result. So for each such block:
//
//   showDialog<void>(  ->  showDialog<bool>(
//   first pop()        ->  pop(false)     (the Cancel TextButton, first in source)
//   later pop()        ->  pop(true)      (the FilledButton that confirms)
//   `if (!context.mounted) return;`  ->  `if (confirmed != true || !context.mounted) return;`
//
// It is deliberately conservative. A block is only touched if it still matches
// the broken shape exactly; anything else is reported and left alone, so running
// this twice cannot silently rewrite an already-correct dialog.
//
//   node scripts/fix-school-action-dialogs.mjs [--check]
//
// With --check it changes nothing and exits 1 if any broken dialog remains, which
// is how it runs in CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'flutter_apps', 'super_admin_app', 'lib', 'screens', 'school_actions.dart');
const CHECK_ONLY = process.argv.includes('--check');

let src = fs.readFileSync(FILE, 'utf8');
const before = src;

// Each entry is the mutating call that runs after the dialog. Used only for
// reporting, so a reader can see WHICH action was left reachable by Cancel.
const ACTIONS = [
  { needle: 'service.approveSchool(', label: 'approve a pending school' },
  { needle: 'service.updateSchool(', label: 'overwrite the school record' },
  { needle: 'service.changePlan(', label: 'change the billing plan' },
  { needle: 'service.saveEmailConfig(', label: 'overwrite the sender config' },
  { needle: 'service.sendPaymentLink(', label: 'send a payment-link email + FCM' },
  { needle: 'service.notifySchool(', label: 'push-notify the whole school' },
  { needle: 'service.provisionSchool(', label: 'trigger a CI deploy workflow' },
];

const fixed = [];
const skipped = [];

// The file uses CRLF throughout. Every pattern here is therefore written against
// a newline-agnostic form: matching a literal `\n  );\n` silently finds nothing,
// because the real bytes are `\r\n  );\r\n`. That is not hypothetical -- the first
// version of this script matched zero dialogs and reported "nothing to change",
// which would have been read as "there is nothing to fix".
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const escapedEOL = EOL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nl = (n) => new Array(n + 1).join(EOL);

// Walk each `await showDialog<...>(` ... `);` block whose buttons still pop with no
// value. The type argument is deliberately NOT part of the match: a dialog can be
// half-fixed (signature already <bool>, buttons and guard still original), and
// keying on the signature is how that one got walked past.
const blockRe = new RegExp(
  'await showDialog<[^>]+>\\(([\\s\\S]*?)' + escapedEOL + '  \\);' + escapedEOL,
  'g',
);
let m;
while ((m = blockRe.exec(src)) !== null) {
  const body = m[1];
  const start = m.index;
  const end = m.index + m[0].length;
  // `showDialog<void>` and `final x = await showDialog<bool>(` differ in what
  // precedes the match, so recover the binding from the source, not the match.
  const head = src.slice(Math.max(0, start - 40), start);
  const bindingMatch = head.match(/final\s+(\w+)\s*=\s*await\s*$/);
  const boundName = bindingMatch ? bindingMatch[1] : null;

  // The text between the end of this dialog and its _busy call. Note the single
  // leading newline: the match above already consumed the one that followed `);`,
  // so the remaining text starts with the blank line's newline.
  const after = src.slice(end, end + 260);
  const guardOld = nl(1) + '  if (!context.mounted) return;' + nl(1) + '  _busy(';
  const guardMatch = after.includes(guardOld);
  if (!guardMatch) {
    skipped.push({ at: lineOf(src, start), why: 'no unconditional _busy after the dialog (not the broken shape)' });
    continue;
  }

  const popCount = (body.match(/Navigator\.of\(ctx\)\.pop\(\)/g) || []).length;

  // A half-fixed dialog has already-correct guards, so it is left alone.
  const alreadyCorrect = boundName !== null && new RegExp('if\\s*\\(' + boundName + '\\s*!=\\s*true').test(after);
  if (alreadyCorrect) {
    skipped.push({ at: lineOf(src, start), why: 'already correct' });
    continue;
  }

  if (popCount < 2) {
    skipped.push({ at: lineOf(src, start), why: 'only ' + popCount + ' bare pop() call(s)' });
    continue;
  }

  // Which action does this dialog lead to? Read forward past the _busy call.
  const actionIdx = src.indexOf('_busy(', end);
  const action = ACTIONS.find((a) => src.slice(actionIdx, actionIdx + 400).includes(a.needle));
  if (!action) {
    skipped.push({ at: lineOf(src, start), why: 'no known mutating action after it -- left alone on purpose' });
    continue;
  }

  // 1) the type argument must be <bool> whatever it was
  let newBlock = body.replace(/^await showDialog<[^>]+>\(/, 'await showDialog<bool>(');

  // 2) Cancel first, then confirm. Both dialogs list the cancel TextButton before
  //    the FilledButton, so source order is the button order.
  let seen = 0;
  newBlock = newBlock.replace(/Navigator\.of\(ctx\)\.pop\(\)/g, () => {
    seen++;
    return 'Navigator.of(ctx).pop(' + (seen === 1 ? 'false' : 'true') + ')';
  });

  // 3) the result is now bound, so the caller can gate on it.
  //
  //    Two things to get right, both learned the hard way:
  //
  //    - If the head already binds a name, the prefix is ''. Emitting
  //      `final confirmed = ` in front of an existing `final confirmed = await`
  //      produced `final confirmed = final confirmed = await`, which is a syntax
  //      error that `node --check` cannot see because it is Dart, and which the
  //      shape audit cannot see either since it only looks for the guard. It took
  //      `dart analyze` to catch.
  //    - The name the guard refers to must be the name that was bound, not a
  //      hardcoded 'confirmed', or a dialog that binds something else would be
  //      gated on an undefined variable.
  const name = boundName || 'confirmed';
  const prefix = boundName ? '' : 'final ' + name + ' = ';
  src =
    src.slice(0, start) + prefix + 'await showDialog<bool>(' + newBlock + nl(1) + '  );' + nl(1) + src.slice(end);

  // The replacement changed length, so recompute the guard position.
  const guardNew = nl(1) + '  if (' + name + ' != true || !context.mounted) return;' + nl(1) + '  _busy(';
  const guardAt = src.indexOf(guardOld, start);
  if (guardAt === -1) {
    skipped.push({ at: lineOf(src, start), why: 'guard vanished after rewrite -- investigate' });
    continue;
  }
  src = src.slice(0, guardAt) + guardNew + src.slice(guardAt + guardOld.length);

  fixed.push({ at: lineOf(before, start), action: action.label, pops: popCount });
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

console.log('\nSchool-action dialog guard\n');
if (skipped.length) {
  console.log('  left alone:');
  for (const s of skipped) console.log('    line ' + s.at + ' -- ' + s.why);
  console.log('');
}
if (fixed.length) {
  console.log('  fixed (' + fixed.length + '):');
  for (const f of fixed) console.log('    line ' + f.at + ' -- Cancel could previously ' + f.action);
} else {
  console.log('  fixed (0): no dialog matched the broken shape');
}
console.log('');

const changed = src !== before;
if (CHECK_ONLY) {
  if (changed) {
    console.error('FAILED: a dialog can still run its action on Cancel\n');
    process.exit(1);
  }
  console.log('OK: no dialog runs its action on Cancel.\n');
} else if (changed) {
  fs.writeFileSync(FILE, src, 'utf8');
  console.log('  written to ' + path.relative(ROOT, FILE) + '\n');
} else {
  console.log('  nothing to change\n');
}
