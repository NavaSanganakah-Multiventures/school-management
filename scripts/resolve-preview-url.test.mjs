// Exercises scripts/resolve-preview-url.mjs against the real shapes wrangler
// produces, including the exact output that broke the previous deploy.
// Run: node scripts/resolve-preview-url.test.mjs
import assert from 'node:assert';
import {
  findPreviewRecord,
  previewNameFrom,
  buildPreviewUrl,
  resolvePreviewUrl,
  verifyPreviewUrl,
  previewHasUrl,
  NO_WORKER_STATUSES,
} from './resolve-preview-url.mjs';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); }
  catch (e) { failures++; console.log('  FAIL  ' + name + '  -> ' + e.message); }
}

const NAME = 'integration-phase0-2-1a2b130';
const SUBDOMAIN = 'nssite';
const WORKER = 'school-management';
const EXPECTED = `https://${NAME}-${WORKER}.${SUBDOMAIN}.workers.dev`;

console.log('\nresolve-preview-url\n');

// The real record from the failed run, trimmed. The APP_BASE_URL binding value is
// the decoy that the previous heuristic latched onto.
const REAL_OUTPUT = [
  '\u001B[2m⛅️ wrangler 4.141.0\u001B[0m',
  '🌀 Building list of assets...',
  '✨ Success! Uploaded 7 files (22 already uploaded) (0.93 sec)',
  '',
  '{',
  '  "preview": {',
  '    "id": "708ac3812c3b404dabdcbfe8cdf7e1fb",',
  `    "slug": "${NAME}",`,
  `    "name": "${NAME}",`,
  '    "tags": [],',
  '    "observability": { "enabled": false, "logs": { "enabled": false } },',
  '    "logpush": false,',
  '    "bindings": {',
  '      "APP_BASE_URL": {',
  '        "text": "https://school-management-preview.workers.dev",',
  '        "type": "plain_text"',
  '      },',
  '      "MEDIA_BUCKET": { "bucket_name": "school-management-preview", "type": "r2_bucket" },',
  '      "SCHOOL_NAME": { "text": "Pragnya Mitra Public School (Preview)", "type": "plain_text" }',
  '    },',
  '    "assets": { "config": { "base_path": "/" } },',
  '    "author_id": "de1c0e9e2e56708f043994bef2bef5e9",',
  '    "author_email": ""',
  '  }',
  '}',
  '',
].join('\n');

check('finds the record past the progress output and ANSI codes', () => {
  const rec = findPreviewRecord(REAL_OUTPUT);
  assert.ok(rec, 'no record parsed');
  assert.equal(rec.preview.slug, NAME);
});

check('resolves the documented Preview URL', () => {
  const r = resolvePreviewUrl(REAL_OUTPUT, SUBDOMAIN, WORKER);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.previewName, NAME);
  assert.equal(r.url, EXPECTED);
});

// THE regression check. The old heuristic returned the APP_BASE_URL binding value,
// so every probe hit a host that does not exist while the Preview had deployed
// fine. 23/23 probes failed with "could not resolve host" and the real cause was a
// few steps earlier.
check('never returns the APP_BASE_URL placeholder', () => {
  const r = resolvePreviewUrl(REAL_OUTPUT, SUBDOMAIN, WORKER);
  assert.ok(
    !r.url.includes('school-management-preview.workers.dev'),
    'returned the placeholder: ' + r.url,
  );
});

check('the preview name is never read out of bindings', () => {
  const hostile = JSON.stringify({
    preview: { slug: NAME },
    bindings: { APP_BASE_URL: { text: 'x' }, slug: 'wrong-name' },
  });
  assert.equal(previewNameFrom(findPreviewRecord(hostile)), NAME);
});

check('prefers slug over name', () => {
  const rec = findPreviewRecord(JSON.stringify({ preview: { slug: 'from-slug', name: 'from-name' } }));
  assert.equal(previewNameFrom(rec), 'from-slug');
});

check('falls back to name when there is no slug', () => {
  const rec = findPreviewRecord(JSON.stringify({ preview: { name: 'only-name' } }));
  assert.equal(previewNameFrom(rec), 'only-name');
});

check('finds the name at any nesting depth', () => {
  const rec = findPreviewRecord(JSON.stringify({ result: { previews: [{ slug: NAME }] } }));
  assert.equal(previewNameFrom(rec), NAME);
});

check('handles compact single-line JSON', () => {
  const r = resolvePreviewUrl(JSON.stringify({ preview: { slug: NAME } }), SUBDOMAIN, WORKER);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, EXPECTED);
});

check('handles carriage-return progress lines', () => {
  const raw = '🌀 Building...\r\n\rDone\r\n' + JSON.stringify({ preview: { slug: NAME } }) + '\n';
  const r = resolvePreviewUrl(raw, SUBDOMAIN, WORKER);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, EXPECTED);
});

check('braces and escaped quotes inside strings do not break parsing', () => {
  const raw = JSON.stringify({ preview: { slug: NAME, note: 'a } brace, a { brace, "q"' } });
  const r = resolvePreviewUrl(raw, SUBDOMAIN, WORKER);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, EXPECTED);
});

check('reports an error when there is no JSON at all', () => {
  const r = resolvePreviewUrl('🌀 Building...\nDone.', SUBDOMAIN, WORKER);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no JSON record/);
});

check('reports an error when the record has no name', () => {
  const r = resolvePreviewUrl(JSON.stringify({ preview: { id: 'x' } }), SUBDOMAIN, WORKER);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no preview name/);
});

check('reports an error when the subdomain is missing', () => {
  const r = resolvePreviewUrl(REAL_OUTPUT, '', WORKER);
  assert.equal(r.ok, false);
  assert.match(r.reason, /subdomain/);
});

check('empty input does not throw', () => {
  assert.equal(resolvePreviewUrl('', SUBDOMAIN, WORKER).ok, false);
});

check('builds the documented hostname shape', () => {
  assert.equal(buildPreviewUrl('feat-x', 'my-worker', 'acme'), 'https://feat-x-my-worker.acme.workers.dev');
});

// ---- verification ----------------------------------------------------------
// The verification is the second half of the bug, and the more embarrassing half:
// the first version accepted any HTTP status, so a 404 counted as "the Preview
// answered" and 23/23 probes went on to fail at 404.

console.log('\nverifyPreviewUrl\n');

const fetchReturning = (code) => () => code;
const attempts1 = (fn) => verifyPreviewUrl(EXPECTED, 1, 0, fn);

check('accepts 200 from /api/health', () => {
  const r = attempts1(fetchReturning('200'));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.probe, EXPECTED + '/api/health');
});

check('probes /api/health, not the bare URL', () => {
  let asked = '';
  verifyPreviewUrl(EXPECTED, 1, 0, (u) => { asked = u; return '200'; });
  assert.equal(asked, EXPECTED + '/api/health');
});

// THE regression check. This is the exact state of the first preview run: the
// Preview deployed, `preview_urls` was not set, and the hostname answered 404.
check('rejects 404, which means no Worker is bound', () => {
  const r = attempts1(fetchReturning('404'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /no Worker bound/);
});

for (const code of NO_WORKER_STATUSES) {
  check('treats ' + code + ' as "no Worker here"', () => {
    assert.equal(attempts1(fetchReturning(code)).ok, false);
  });
}

check('rejects a 500 from the API as unhealthy', () => {
  const r = attempts1(fetchReturning('500'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /expected 200/);
});

check('rejects a thrown connection error', () => {
  const r = verifyPreviewUrl(EXPECTED, 1, 0, () => { throw new Error('curl: (6) Could not resolve host'); });
  assert.equal(r.ok, false);
});

check('retries until the Preview becomes routable', () => {
  const codes = ['404', '404', '200'];
  let i = 0;
  const r = verifyPreviewUrl(EXPECTED, 5, 0, () => codes[i++]);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.attempts, 3);
});

// ---- the `urls` field is the authoritative answer -----------------------
// Cloudflare's own preview record has a `urls` array. On this account it is empty
// for every preview, which is the real reason the constructed hostname 404s: no
// URL was assigned, so the format is not even the problem. Reading this field
// turns "the URL I built does not work" into "no URL exists", which is the
// difference between debugging hostname construction and going to the dashboard.

console.log('\npreviewHasUrl\n');

check('reads urls: [] as "no URL assigned"', () => {
  const rec = findPreviewRecord(REAL_OUTPUT.replace('"assets"', '"urls": [],\n    "assets"'));
  assert.equal(previewHasUrl(rec), false);
});

check('reads a populated urls array as having a URL', () => {
  const rec = findPreviewRecord(JSON.stringify({ preview: { urls: [EXPECTED] } }));
  assert.equal(previewHasUrl(rec), true);
});

check('returns null when the record has no urls field at all', () => {
  const rec = findPreviewRecord(JSON.stringify({ preview: { slug: NAME } }));
  assert.equal(previewHasUrl(rec), null);
});

check('handles a missing record without throwing', () => {
  assert.equal(previewHasUrl(null), null);
});

check('finds urls at any nesting depth', () => {
  const rec = findPreviewRecord(JSON.stringify({ preview: { meta: { urls: [EXPECTED] } } }));
  assert.equal(previewHasUrl(rec), true);
});

console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' resolve-preview-url check(s) failed\n');
  process.exit(1);
}
console.log('All resolve-preview-url checks passed.\n');
