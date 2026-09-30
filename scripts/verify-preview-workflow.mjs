// Checks that deploy-preview.yml cannot be structurally broken in the ways that
// have actually broken it.
//
// WHY THIS FILE EXISTS
//
// deploy-preview.yml has failed on every run since 2026-09-27, across nine
// branches, and two of those failures are worth reading closely because they are
// not the same failure:
//
//   same-repo branch -- `wrangler preview` deploys cleanly, returns a complete
//     record, and reports `"urls": []`. The Worker's "Preview" switch in the
//     Cloudflare dashboard is off. An account setting with no wrangler command
//     behind it, so no change to this repository can fix it.
//
//   Dependabot branch -- GitHub withholds repository secrets from Dependabot, so
//     CLOUDFLARE_API_TOKEN is the empty string and wrangler fails with "In a
//     non-interactive environment, it's necessary to set a
//     CLOUDFLARE_API_TOKEN environment variable". A red X on a dependency bump
//     that has nothing wrong with it.
//
// The second one was fixable in this repository, and a red check that people
// learn to ignore is how this repo shipped two harnesses that no workflow ever
// referenced. This file is the check for the workflow itself: it cannot make a
// Preview deploy, but it can make sure the steps that must run still do, and
// that the steps which cannot run for a given actor are declared as such rather
// than left to fail on a missing token.
//
// WHAT IT CHECKS
//
//   1. Every step that touches the Cloudflare API or reads a Preview output is
//      guarded by an actor condition, so a secret-less actor skips it.
//   2. No step consumes secrets it cannot have: the guard is on the step that
//      needs the token, not only on its successors.
//   3. The verification steps that need no secret are NOT guarded away. This is
//      the check that would catch a fix that made Dependabot PRs "pass" by
//      skipping everything, which is the failure mode a well-intentioned
//      `if:` on the job would introduce.
//   4. The step order still puts the harnesses before the deploy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.join(ROOT, '.github', 'workflows', 'deploy-preview.yml');

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

console.log('\nDeploy Preview workflow structure\n');

check('deploy-preview.yml exists', fs.existsSync(WF));
if (!fs.existsSync(WF)) {
  console.log('\nFAILED: cannot continue without the workflow.\n');
  process.exit(1);
}

const src = fs.readFileSync(WF, 'utf8');

/**
 * Splits the workflow into step blocks. Each block runs from a `- name:` (or
 * `- uses:` / `- run:` at step indentation) up to the next one, so an `if:` is
 * matched to the step it actually belongs to. Matching the name and the `if:`
 * independently is the mistake that lets a guarded step and an unguarded one
 * look the same.
 */
function steps() {
  const out = [];
  const lines = src.split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^ {6}- (name|uses|run):\s*(.*)$/);
    if (m) {
      if (cur) out.push(cur);
      cur = { header: m[1], first: m[2], body: line };
      continue;
    }
    if (cur) cur.body += '\n' + line;
  }
  if (cur) out.push(cur);
  return out.map((s) => ({
    name: s.header === 'name' ? s.first : (s.header === 'uses' ? 'uses: ' + s.first : '(inline run)'),
    body: s.body,
    guarded: /^\s+if:\s*github\.actor\s*!=\s*'dependabot\[bot\]'/m.test(s.body),
  }));
}

const all = steps();
check('steps were parsed out of the workflow', all.length > 10, 'found ' + all.length);

// --- 1. every Cloudflare-touching step is guarded --------------------------------

// These are the steps that either call the Cloudflare API or read an output
// produced by one. Each needs a token, or an output that only exists once a
// token was available, so each has to be skipped for a secret-less actor.
const NEEDS_CLOUDFLARE = [
  'Apply migrations to the PREVIEW D1',
  'Deploy preview and resolve its URL',
  'Deploy preview (final)',
  'Report preview URL',
  'Smoke test the preview API',
];

for (const name of NEEDS_CLOUDFLARE) {
  const s = all.find((x) => x.name === name);
  if (!s) {
    check('step exists: ' + name, false, 'no step by that name -- was it renamed?');
    continue;
  }
  check(name + ' is skipped for Dependabot', s.guarded,
    'it needs a Cloudflare token or a Preview URL, both of which a Dependabot '
    + 'run does not have, so it would fail with a wrangler auth error');
}

// --- 2. no unguarded step references a secret ---------------------------------

for (const s of all) {
  if (s.guarded) continue;
  if (/secrets\./.test(s.body)) {
    check('unguarded step does not read a secret: ' + s.name, false,
      'reads secrets. but has no actor guard');
  }
}
check('no unguarded step reads a repository secret',
  !all.some((s) => !s.guarded && /secrets\./.test(s.body)),
  'an unguarded secrets.* reference is a step that will fail for Dependabot');

// --- 3. the secret-less harnesses still run ------------------------------------

// The fix must not become "skip everything so it goes green". These need no
// secret and all of them passed on the Dependabot run this was written from, so
// guarding any of them away would trade a misleading red for a silently
// unverified dependency bump.
const MUST_RUN = [
  'Verify Phase 0 (internal M2M signing)',
  'Verify routing contract',
  'Verify dedicated-D1 table coverage',
  'Verify migration 0041 (parent_student_links backfill)',
  'Verify migration 0042 (dedicated migration ledger)',
  'Verify preview URL resolution',
  'Verify billing M2M authorisation',
  'Mutation-check the billing harness',
];

for (const name of MUST_RUN) {
  const s = all.find((x) => x.name === name);
  if (!s) {
    check('step exists: ' + name, false, 'no step by that name');
    continue;
  }
  check(name + ' still runs without a secret', !s.guarded,
    'it is guarded away, so a dependency bump would skip it');
}

// --- 4. harnesses come before the deploy ---------------------------------------

const firstDeploy = all.findIndex((x) => NEEDS_CLOUDFLARE.includes(x.name));
const lastHarness = all.reduce((acc, x, i) => (MUST_RUN.includes(x.name) ? i : acc), -1);
check('the harnesses run before anything that deploys', lastHarness < firstDeploy,
  'a red harness must not produce a deployed preview');
check('a harness is present at all', lastHarness >= 0);

// --- 5. the actor guard is Dependabot specifically, not a blanket skip ---------

const guardCount = (src.match(/if:\s*github\.actor\s*!=\s*'dependabot\[bot\]'/g) || []).length;
check('the guard names dependabot specifically', guardCount === NEEDS_CLOUDFLARE.length,
  'found ' + guardCount + ' guards for ' + NEEDS_CLOUDFLARE.length + ' steps that need one');
check('there is no job-level actor guard that would skip the harnesses',
  !/^ {2}preview:\s*\n(?:.*\n)*?\s+if:\s*github\.actor\s*!=\s*'dependabot/gm.test(src),
  'a job-level `if:` would skip the secret-less harnesses too');

// --- 6. the dashboard blocker is documented where someone will hit it ----------

// Not a behaviour check. The Worker "Preview" switch is off, and nothing in this
// repository can turn it on, so the only honest thing is that the workflow says
// so at the point of failure rather than leaving a bare `"urls": []`.
//
// The comment is wrapped across lines and every continuation line carries its own
// leading `#`, so a regex over the raw source matches neither the phrase nor
// nothing useful -- `"Preview"` and `switch` end up separated by a newline and a
// hash. Both are stripped first: the hashes, so the text is what a reader sees,
// then the whitespace, so a line break is not a sentence break.
//
// Two earlier versions of this check failed against a comment that says exactly
// the right thing. A check that cannot survive a reworded comment is a check
// that gets deleted rather than fixed, which is worse than having none.
const flat = src
  .split(/\r?\n/)
  .map((l) => l.replace(/^\s*#+\s?/, ' '))
  .join(' ')
  .replace(/\s+/g, ' ');
check('the account-level Preview switch is documented in the workflow',
  /Worker URL "Preview" switch/.test(flat)
    || /turn ON "Preview"/.test(flat)
    || /Settings -> Domains/.test(flat),
  'the real blocker for same-repo branches cannot be fixed from here, so the '
  + 'workflow has to name it');
check('the resolver still turns an empty urls array into a named error',
  /resolve-preview-url\.mjs/.test(src),
  'that script is what makes "urls: []" legible instead of a DNS error later');

console.log('\n' + '-'.repeat(64));
console.log(
  'Inspected ' + all.length + ' step(s); ' + guardCount + ' guarded for Dependabot, ' +
  MUST_RUN.length + ' required to run regardless.');

if (failed) {
  console.log('\nFAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' deploy-preview structure checks passed.');
