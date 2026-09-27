// Issues a UNIQUE AUTH_SECRET to every dedicated worker.
//
// WHY PER SCHOOL
//
// Until now all seven dedicated workers signed and verified tokens with the platform
// worker's key. One leak of that key was a fleet-wide leak: a token minted for any
// school would verify on all of them. `getAuthUser` already pins SCHOOL_ID, so a
// cross-school token is refused -- this is defence in depth against a key that
// escapes rather than a working hole today.
//
// WHY THIS SCRIPT IS NOT A LOOP OVER DEPLOY
//
// The key has to be set as a Worker secret and the value must never be printed, logged
// or committed. It writes a record of SHA-256 fingerprints only, so the set of schools
// that have a key can be compared later without holding any key.
//
// PREREQUISITE, AND WHY IT WAS NOT SKIPPABLE
//
// `getInternalSyncSecret` derives m2m_<hmac(AUTH_SECRET)> when INTERNAL_SYNC_SECRET is
// unset -- and it was unset on BOTH tiers. The derived values matched only because the
// two tiers shared one AUTH_SECRET. Giving each school its own key would have changed
// every school's M2M secret to a value the platform cannot verify, and the billing
// proxy would have failed on every school at once. A fleet-wide INTERNAL_SYNC_SECRET
// is now set explicitly on all eight workers, which is what makes this safe.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// wrangler's own CLI entry point, invoked with this node binary.
//
// Not `npx wrangler`: on Windows npx is a .cmd shim and execFileSync fails on it with
// EINVAL, and `shell: true` would put the key on a command line. Running the JS entry
// directly keeps the secret on stdin and off every process listing. wrangler's
// "exports" map does not expose ./bin, so the package main is used instead.
const WRANGLER_BIN = require.resolve('wrangler');

const WORKERS = [
  'vidyasetu',
  'a',
  'yagya-pragnya',
  'school795082',
  'school188328',
  'qa-school-266668',
  'yagyaashram',
];

function fingerprint(secret) {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

const DRY_RUN = process.argv.includes('--dry-run');
// Writes the DEDICATED_SECRETS_JSON payload to this path so it can be piped straight
// into `gh secret set`. Deliberately NOT the repository and NOT a tracked path: it is
// key material, and the fingerprint record below is what gets committed.
const PAYLOAD_PATH = process.env.PAYLOAD_PATH || '';
const record = {};
const payload = {};

for (const worker of WORKERS) {
  const secret = randomBytes(48).toString('base64url');
  record[worker] = {
    fingerprint: fingerprint(secret),
    length: secret.length,
    setAt: new Date().toISOString(),
  };
  payload[worker] = { AUTH_SECRET: secret };
  if (DRY_RUN) {
    console.log('  would set ' + worker + '  fingerprint ' + record[worker].fingerprint);
    continue;
  }
  // The secret goes in over stdin and is never echoed.
  execFileSync(process.execPath,
    [WRANGLER_BIN, 'secret', 'put', 'AUTH_SECRET', '--name', worker],
    { input: secret, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  console.log('  set ' + worker.padEnd(20) + ' fingerprint ' + record[worker].fingerprint);
}

if (!DRY_RUN) {
  fs.writeFileSync('per-school-auth-secret-fingerprints.json', JSON.stringify(record, null, 2) + '\n');
  console.log('\nWrote fingerprints (no key material) to per-school-auth-secret-fingerprints.json');
  if (PAYLOAD_PATH) {
    // 0o600: readable only by this user, and outside the repo.
    fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(payload), { mode: 0o600 });
    console.log('Wrote DEDICATED_SECRETS_JSON payload to ' + PAYLOAD_PATH + ' (key material, not in the repo)');
    console.log('  next: gh secret set DEDICATED_SECRETS_JSON < "' + PAYLOAD_PATH + '"');
  }
}
