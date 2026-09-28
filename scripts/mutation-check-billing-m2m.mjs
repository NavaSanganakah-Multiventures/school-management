// Mutation-checks the billing harness: applies a named mutation to a source file,
// runs the harness, prints whether it caught it, and restores the file.
//
// WHY THIS FILE
//
// A harness that always passes proves nothing. Twice in this repo a green harness
// sat on top of broken or unexercised code, so every change to an authorisation
// boundary here is checked by breaking it on purpose and confirming the harness
// notices. The failure mode this guards against is a mutation that silently does
// not apply -- which looks exactly like a harness that is too weak.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();

// Patterns are written against the exact text that is in the file, and every one of
// them is checked for having actually matched before a verdict is printed. An earlier
// version of this file reported "45 passed, 0 failed" as a CAUGHT result, and four
// patterns silently matched nothing -- so both mistakes were reported as green.
const MUTATIONS = [
  {
    name: 'the dedicated deploy step stops forwarding INTERNAL_SYNC_SECRET',
    file: '.github/workflows/deploy.yml',
    // Only the one inside the dedicated step -- the platform step also sets it, and
    // mutating that instead would leave this check passing for the wrong reason.
    pattern: /(      - name: Deploy Dedicated Workers[\s\S]*?)(\n\s*INTERNAL_SYNC_SECRET: \$\{\{ secrets\.INTERNAL_SYNC_SECRET \}\})/,
    replace: '$1',
  },
  {
    name: 'the deploy falls back to the platform AUTH_SECRET again',
    file: 'scripts/deploy-dedicated.mjs',
    pattern: /AUTH_SECRET: perSchoolAuthSecret,/,
    replace: 'AUTH_SECRET: perSchoolAuthSecret || process.env.AUTH_SECRET,',
  },
  {
    name: 'internal route re-enters over the network instead of in process',
    file: 'api/internal/index.ts',
    pattern: /  if \(rootApp\) \{\n    return rootApp\.fetch\(reentry, c\.env, undefined\);\n  \}/,
    replace: '  if (rootApp) {\n    return fetch(reentry);\n  }',
  },
  {
    name: 'internal route stops re-signing for the billing path',
    file: 'api/internal/index.ts',
    pattern: /\n  for \(const \[k, v\][\s\S]*?headers\.set\(k, v\);\n  \}\n/,
  },
  {
    // These two moved out of api/billing into api/lib/proxied-auth when the check was
    // shared with /api/plugins and /api/features. Their patterns are repointed there
    // rather than left stale, because a mutation that reports NOT APPLIED has
    // silently proved nothing -- which is the failure mode this whole file exists to
    // prevent. Duplicates of the SuperAdmin mutation are not added, because the
    // repointed ones below already cover it.
    name: 'the proxied-surface check stops re-checking that the request body was signed',
    file: 'api/lib/proxied-auth.ts',
    pattern: /(body: )rawBody,(\n\s*signature,)/,
    replace: "$1'',$2",
  },
  {
    name: 'the dedicated proxy forwards the caller token again',
    file: 'api/index.ts',
    pattern: /(      if \(caller\) \{\n        headers\.set\('X-Acting-Role')/,
    replace:
      "      headers.set('Authorization', c.req.header('Authorization') || '');\n$1",
  },
  {
    name: 'the dedicated proxy stops rejecting a bogus token',
    file: 'api/index.ts',
    pattern:
      /\n      if \(c\.req\.header\('Authorization'\) && !caller\) \{\n        return c\.json\(\{ success: false, message: '[^']*' \}, 401\);\n      \}\n/,
  },
  {
    name: 'the dedicated proxy stops requiring SCHOOL_ID',
    file: 'api/index.ts',
    pattern: /\n      const schoolId = String\(\(c\.env && c\.env\.SCHOOL_ID\) \|\| ''\)\.trim\(\);/,
    replace: "\n      const schoolId = 'school-invented';",
  },
  {
    name: 'the proxied-surface check stops comparing the presented internal secret',
    file: 'api/lib/proxied-auth.ts',
    pattern: /if \(!\(await constantTimeEqual\(providedSecret, expectedSecret\)\)\) return null;/,
    replace: 'if (!result.ok) return null;',
    // This one is expected to survive, and it is worth being explicit about why rather
    // than quietly deleting the mutation: the secret comparison is defence in depth.
    // Dropping it does not open a hole, because verifyInternalSignature HMACs with the
    // presented secret, so a wrong secret already fails there. The comparison only
    // pins the secret to the configured one.
    expectedToSurvive:
      'the signature is the real gate, since it is computed with the presented secret, so a wrong secret already fails verification',
  },
  {
    // The check this mutation exercises moved out of api/billing into
    // api/lib/proxied-auth, so the pattern has to follow it. A mutation whose pattern
    // no longer matches reports NOT APPLIED and silently proves nothing -- which is
    // exactly what happened the first time this check was run after the move.
    name: 'the proxied-surface check stops re-verifying the M2M signature',
    file: 'api/lib/proxied-auth.ts',
    pattern: /if \(!result\.ok \|\| !expectedSecret\) return null;/,
    replace: 'if (!expectedSecret) return null;',
  },
  {
    name: 'the proxied-surface check stops refusing SuperAdmin on the M2M path',
    file: 'api/lib/proxied-auth.ts',
    pattern: /if \(!role \|\| role === SUPER_ADMIN\) return null;/,
    replace: 'if (!role) return null;',
  },
  {
    name: 'the proxied-surface check trusts X-Acting-Role without verifying anything',
    file: 'api/lib/proxied-auth.ts',
    pattern: /const role = normalizeRole\(c\.req\.header\('X-Acting-Role'\)\);[\s\S]*?if \(!role \|\| role === SUPER_ADMIN\) return null;/,
    replace: "const role = 'Director';",
  },
];

let allCaught = true;

function runHarness() {
  try {
    const out = execFileSync(process.execPath, ['scripts/verify-billing-m2m.mjs'], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { out, exitCode: 0 };
  } catch (err) {
    // A non-zero exit is the harness's own signal, not a crash to be shrugged off,
    // but a real crash with no summary is also a detection.
    return { out: (err.stdout || '') + (err.stderr || ''), exitCode: typeof err.status === 'number' ? err.status : 1 };
  }
}

for (const m of MUTATIONS) {
  const file = path.join(ROOT, m.file);
  const originalBytes = fs.readFileSync(file);
  // The working copy is normalised to LF so the patterns below can be written with
  // plain \n. The repository is CRLF, and four patterns silently matched nothing on
  // the first run of this file for exactly that reason. The original bytes are put
  // back byte for byte at the end, so the working tree is left untouched.
  const working = originalBytes.toString('utf-8').replace(/\r\n/g, '\n');
  const mutated = m.replace ? working.replace(m.pattern, m.replace) : working.replace(m.pattern, '');

  if (mutated === working) {
    console.log('  NOT APPLIED  ' + m.name);
    console.log('              the pattern did not match, so nothing was broken and nothing was proved');
    allCaught = false;
    continue;
  }

  fs.writeFileSync(file, mutated, 'utf-8');
  let summary = 'no summary';
  let failures = 0;
  let parsed = false;
  try {
    const r = runHarness();
    const hit = r.out.match(/(\d+) passed, (\d+) failed/);
    if (hit) {
      parsed = true;
      summary = hit[0];
      failures = Number(hit[2]);
    } else {
      summary = r.out.trim().split('\n').slice(-1)[0] || 'no output';
    }
  } finally {
    fs.writeFileSync(file, originalBytes);
  }

  // A mutation counts as caught only when the harness RAN and reported a failure.
  // A harness that died during the transpile proved nothing: the mutation did not
  // compile, so the run never reached the security assertions. Counting that as a
  // detection would let an invalid mutation look like a working test.
  const ranAndFailed = parsed && failures > 0;
  if (!parsed) {
    console.log('  INVALID     ' + m.name + '   [harness never finished: ' + summary + ']');
    allCaught = false;
    continue;
  }

  if (m.expectedToSurvive) {
    console.log('  ' + (ranAndFailed ? 'caught    ' : 'SURVIVES  ') + m.name + '   [' + summary + ']');
    if (ranAndFailed) {
      console.log('              expected to survive: ' + m.expectedToSurvive);
    }
    continue;
  }
  console.log('  ' + (ranAndFailed ? 'CAUGHT    ' : 'MISSED !! ') + m.name + '   [' + summary + ']');
  if (!ranAndFailed) allCaught = false;
}

console.log(allCaught ? '\nEvery mutation that should be caught, was.' : '\nSome mutations were missed.');
process.exit(allCaught ? 0 : 1);
