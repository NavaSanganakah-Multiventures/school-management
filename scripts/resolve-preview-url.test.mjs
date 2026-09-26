// Exercises scripts/resolve-preview-url.mjs against the real shapes wrangler
// produces, including the exact output that broke the previous deploy.
// Run: node scripts/resolve-preview-url.test.mjs
import assert from 'node:assert';
import {
  findPreviewRecord,
  previewNameFrom,
  buildPreviewUrl,
  resolvePreviewUrl,
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

console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' resolve-preview-url check(s) failed\n');
  process.exit(1);
}
console.log('All resolve-preview-url checks passed.\n');
