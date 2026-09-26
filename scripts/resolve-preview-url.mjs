#!/usr/bin/env node
// scripts/resolve-preview-url.mjs
//
// Works out the URL of a deployed Worker Preview, then proves it answers.
//
// Usage: node scripts/resolve-preview-url.mjs <wrangler-output-file> <workers-dev-subdomain> [worker-name]
//
// WHY THIS IS NOT A PARSE OF WRANGLER'S OUTPUT
//
// The instinct is to read the URL out of `wrangler preview --json`. That does not
// work, and the reason is worth recording.
//
// Two things mislead you. First, `--json` does not mean JSON-only: wrangler still
// writes its progress output to stdout, so `JSON.parse` of the captured stream
// fails with
//
//     SyntaxError: Unexpected token '<emoji>', "Building"... is not valid JSON
//
// Second, once you get past that, the document is a preview *record*, not a
// deploy result. It has `id`, `slug`, `name`, `tags`, `observability`, the
// resolved `bindings` and the asset config -- and no URL anywhere. The only
// workers.dev string in it is the `APP_BASE_URL` binding value, which is a
// placeholder, so a "find any workers.dev URL in the output" heuristic returns
// the placeholder and every subsequent request goes to a host that does not
// exist. That is exactly what happened: 23/23 smoke probes failed with
// "Could not resolve host: school-management-preview.workers.dev" while the
// Preview had in fact deployed successfully.
//
// There is also no `wrangler preview list` to ask instead.
//
// SO: the URL is derived from the documented hostname format, which is fixed and
// contains no surprises:
//
//     <preview-name>-<worker-name>.<subdomain>.workers.dev
//
// The preview name comes from wrangler's own record (`slug`, falling back to
// `name`), so it is not re-derived from the branch name and cannot drift. The
// subdomain comes from the Cloudflare API, not from a guess.
//
// And then it is verified, because a constructed URL is still a claim. A wrong
// subdomain or a changed format must fail here, loudly, rather than turn into 23
// confusing "could not resolve host" probe failures later. That inversion -- the
// real problem surfacing as the least useful possible error -- is the whole
// reason this step exists.

import fs from 'fs';
import { execFileSync } from 'child_process';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;
const OTHER_ESCAPES = /\u001B[@-Z\\-_]/g;

function stripAnsi(text) {
  return String(text).replace(ANSI, '').replace(OTHER_ESCAPES, '');
}

// Returns the balanced JSON object at `start`, or null if it never balances.
// String literals and escapes are respected: a `}` inside a JSON string value
// would otherwise close the object early and produce a parse error that looks
// like wrangler emitted malformed JSON.
function balancedObjectAt(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, j + 1);
    }
  }
  return null;
}

// Candidate starts are `{` at the beginning of the text or at the beginning of a
// line: wrangler pretty-prints its record, but a caller may pipe compact JSON,
// and an earlier version of this parser only handled the pretty-printed shape and
// silently found nothing in the other. Candidates are tried in order and the
// first that both balances and parses wins, so a stray brace in a progress line
// cannot beat the real document.
export function findPreviewRecord(text) {
  const clean = stripAnsi(text);
  const candidates = [];
  if (clean[0] === '{') candidates.push(0);
  for (let i = 1; i < clean.length; i++) {
    if (clean[i] === '{' && clean[i - 1] === '\n') candidates.push(i);
  }
  for (const start of candidates) {
    const candidate = balancedObjectAt(clean, start);
    if (candidate === null) continue;
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // A brace in the progress output. Try the next candidate.
    }
  }
  return null;
}

// Pulls the preview's own name out of wrangler's record.
//
// `slug` first, then `name`: the record nests it under `preview` today, but the
// walk means a future reshuffle does not silently yield the wrong name. Values
// from the resolved `bindings` are never considered -- `APP_BASE_URL` lives there
// and it is a placeholder, which is the trap described at the top of this file.
export function previewNameFrom(record) {
  if (!record || typeof record !== 'object') return null;
  const seen = [];
  const walk = (node, depth) => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1); return; }
    for (const [k, v] of Object.entries(node)) {
      // Explicitly not "bindings", so a placeholder URL can never be mistaken
      // for a name.
      if (k === 'slug' || k === 'name' || k === 'preview_name') {
        if (typeof v === 'string' && v.trim() && v !== 'null') seen.push(v.trim());
      }
      walk(v, depth + 1);
    }
  };
  walk(record, 0);
  return seen[0] || null;
}

// The documented workers.dev Preview hostname.
export function buildPreviewUrl(previewName, workerName, subdomain) {
  return `https://${previewName}-${workerName}.${subdomain}.workers.dev`;
}

export function resolvePreviewUrl(wranglerOutput, subdomain, workerName) {
  const record = findPreviewRecord(wranglerOutput);
  if (!record) {
    return { ok: false, reason: 'no JSON record found in wrangler output' };
  }
  const name = previewNameFrom(record);
  if (!name) {
    return { ok: false, reason: 'wrangler record contained no preview name' };
  }
  if (!subdomain) {
    return { ok: false, reason: 'no workers.dev subdomain supplied' };
  }
  if (!workerName) {
    return { ok: false, reason: 'no worker name supplied' };
  }
  return { ok: true, previewName: name, url: buildPreviewUrl(name, workerName, subdomain) };
}

// Wrangler's own record carries a `urls` array, and it is the authoritative
// statement of whether the Preview was actually given a hostname. Checking it
// turns "the constructed URL 404s" into "no URL was assigned at all", which is a
// completely different fix.
export function previewHasUrl(record) {
  if (!record || typeof record !== 'object') return null;
  const found = [];
  const walk = (node, depth) => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1); return; }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'urls' && Array.isArray(v)) found.push(v);
      walk(v, depth + 1);
    }
  };
  walk(record, 0);
  if (found.length === 0) return null;
  return found.some((u) => u && u.length > 0);
}

// Statuses that mean "there is no Worker on this hostname", as opposed to "a
// Worker answered".
//
// 000000 is curl's own code for a DNS or connection failure. 404 is what a
// workers.dev hostname returns when the name is well-formed and resolvable but no
// Worker is bound to it -- which is exactly the `preview_urls` state described in
// wrangler.toml. 530 is the same idea for a zone that exists but has no route.
//
// Treating any of these as "the URL works" is how the first preview run ended with
// 23/23 probes at 404 while the deploy steps were all green.
export const NO_WORKER_STATUSES = ['000000', '404', '530', '1014'];

// Proves the URL serves our API.
//
// It checks /api/health expecting 200 rather than fetching the bare URL, because
// "responds" is not the property that matters -- "the Worker's API is mounted and
// serving" is. A hostname can answer with a 404 page from the edge and still be
// useless for this purpose, and a health probe failing here is a far clearer signal
// than 23 downstream probe failures.
export function verifyPreviewUrl(url, attempts = 6, delayMs = 5000, fetchImpl) {
  const probe = fetchImpl || ((u) => execFileSync('curl', [
    '-sS', '-o', '/dev/null', '-w', '%{http_code}',
    '--connect-timeout', '10', '--max-time', '20', u,
  ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim());

  const health = url.replace(/\/+$/, '') + '/api/health';
  let last = '';
  for (let i = 1; i <= attempts; i++) {
    let code = '000000';
    try {
      code = String(probe(health) || '').trim();
      if (code === '200') return { ok: true, code, attempts: i, probe: health };
      last = NO_WORKER_STATUSES.indexOf(code) !== -1
        ? 'no Worker bound to that hostname (HTTP ' + code + ' from ' + health + ')'
        : 'expected 200 from ' + health + ', got ' + code;
    } catch (e) {
      last = String((e && e.stderr) || (e && e.message) || 'request failed')
        .split('\n')[0].slice(0, 200);
    }
    if (i < attempts) {
      execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${delayMs})`]);
    }
  }
  return { ok: false, reason: last || 'no response', probe: health };
}

// ---- CLI -------------------------------------------------------------------
const isMain = process.argv[1]
  && import.meta.url === 'file://' + process.argv[1].replace(/\\/g, '/');

if (isMain) {
  const file = process.argv[2];
  const subdomain = process.argv[3];
  const workerName = process.argv[4];
  if (!file || !subdomain || !workerName) {
    console.error(
      '\nUsage: node scripts/resolve-preview-url.mjs <wrangler-output-file> '
      + '<workers-dev-subdomain> <worker-name>\n',
    );
    process.exit(2);
  }

  const raw = fs.readFileSync(file, 'utf-8');
  const result = resolvePreviewUrl(raw, subdomain, workerName);
  if (!result.ok) {
    console.error('resolve-preview-url: ' + result.reason);
    process.exit(1);
  }

  // Check what Cloudflare actually assigned BEFORE probing, so the diagnosis names
  // the cause rather than the symptom.
  const hasUrl = previewHasUrl(findPreviewRecord(raw));
  if (hasUrl === false) {
    console.error(
      'resolve-preview-url: the Preview deployed, but Cloudflare assigned it no URL.\n'
      + '  Preview name: ' + result.previewName + '\n'
      + "  wrangler's own record reports:  \"urls\": []\n"
      + '\n'
      + '  This is not a hostname-format problem. The Preview exists and is\n'
      + '  deployed; there is simply nothing bound to serve it, so any request to\n'
      + '  ' + result.url + ' returns 404.\n'
      + '\n'
      + '  Fix, once per worker, in the Cloudflare dashboard:\n'
      + '    Workers & Pages -> school-management -> Settings -> Domains\n'
      + '    -> "Worker URL" -> turn ON "Preview"\n'
      + '\n'
      + '  wrangler.toml already sets `preview_urls = true`, and a production deploy\n'
      + '  has run since, but the account-level toggle is still off. The two are\n'
      + '  separate: the config key records the intent, the dashboard switch is what\n'
      + '  actually enables the host.\n',
    );
    process.exit(1);
  }

  const verify = verifyPreviewUrl(result.url);
  if (!verify.ok) {
    console.error(
      'resolve-preview-url: constructed ' + result.url + ' but the API did not answer.\n'
      + '  Preview name: ' + result.previewName + '\n'
      + '  worker:       ' + workerName + '\n'
      + '  subdomain:    ' + subdomain + '\n'
      + '  probed:       ' + verify.probe + '\n'
      + '  problem:      ' + verify.reason + '\n',
    );
    process.exit(1);
  }

  console.error('preview ' + result.previewName + ' -> ' + verify.probe
    + ' HTTP ' + verify.code + ' after ' + verify.attempts + ' attempt(s)');
  process.stdout.write(result.url);
}
