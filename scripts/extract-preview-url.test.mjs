// Exercises scripts/extract-preview-url.mjs against the output shapes wrangler
// actually produces. Run: node scripts/extract-preview-url.test.mjs
import assert from 'node:assert';
import { extractPreviewUrl } from './extract-preview-url.mjs';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); }
  catch (e) { failures++; console.log('  FAIL  ' + name + '  -> ' + e.message); }
}

const NAME = 'integration-phase0-2-a9ca27a';
const PREVIEW_URL = `https://${NAME}-school-management.nssite.workers.dev`;
const DEPLOY_URL = 'https://2f5d4bbc9845419c969ad57a5f8dc0a9-school-management.nssite.workers.dev';

console.log('\nextract-preview-url\n');

// The shape that actually failed in CI: progress output first, JSON last.
check('progress lines before the JSON document', () => {
  const raw = [
    '\u001B[2m⛅️ wrangler 4.141.0\u001B[0m',
    '────────────────────',
    '\u001B[1m🌀 Building\u001B[0m',
    'Your Worker has access to the following bindings:',
    '  KV: CONFIG_KV',
    '\u001B[32m✨ Built successfully!\u001B[0m',
    '{"name":"' + NAME + '","url":"' + PREVIEW_URL + '","deployments":[{"url":"' + DEPLOY_URL + '"}]}',
    '',
  ].join('\n');
  const r = extractPreviewUrl(raw, NAME);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, PREVIEW_URL);
});

// Pure JSON, no progress. This is the case the CI run never actually got.
check('pure JSON document', () => {
  const r = extractPreviewUrl(JSON.stringify({ url: PREVIEW_URL }), NAME);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, PREVIEW_URL);
});

// Progress written with carriage returns, which is how wrangler animates.
check('carriage-return progress lines', () => {
  const raw = '🌀 Building...\r\n\rDone\r\n' + JSON.stringify({ url: PREVIEW_URL }) + '\n';
  const r = extractPreviewUrl(raw, NAME);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, PREVIEW_URL);
});

// The Preview URL must win over a deployment URL, so the smoke test keeps
// tracking the latest deploy instead of pinning one revision.
check('prefers the Preview URL over a deployment URL', () => {
  const r = extractPreviewUrl(
    JSON.stringify({ deployments: [{ url: DEPLOY_URL }], url: PREVIEW_URL }),
    NAME,
  );
  assert.equal(r.url, PREVIEW_URL);
});

// Nested shapes: the key moves between wrangler versions, so the walk must not
// depend on one path.
check('finds the URL at any nesting depth', () => {
  const deep = { result: { previews: [{ items: [{ previewUrl: PREVIEW_URL }] }] } };
  const r = extractPreviewUrl(JSON.stringify(deep), NAME);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, PREVIEW_URL);
});

// A '}' inside a string value must not close the object early. Getting this wrong
// produces a parse error that looks like wrangler emitted bad JSON.
check('braces inside string values do not break parsing', () => {
  const raw = JSON.stringify({ note: 'a } brace and a { brace', url: PREVIEW_URL });
  const r = extractPreviewUrl(raw, NAME);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, PREVIEW_URL);
});

// Escaped quotes inside strings must not flip string tracking.
check('escaped quotes inside strings do not break parsing', () => {
  const raw = JSON.stringify({ note: 'he said "hi" loudly', url: PREVIEW_URL });
  const r = extractPreviewUrl(raw, NAME);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, PREVIEW_URL);
});

// Failing loudly is the point. Falling back to scraping would defeat the reason
// this script exists.
check('reports an error when there is no JSON at all', () => {
  const r = extractPreviewUrl('🌀 Building...\nDone. Deployed to ' + PREVIEW_URL, NAME);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no JSON document/);
});

check('reports an error when the JSON has no workers.dev URL', () => {
  const r = extractPreviewUrl(JSON.stringify({ name: NAME, url: 'https://example.com' }), NAME);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no workers\.dev URL/);
});

check('empty input does not throw', () => {
  const r = extractPreviewUrl('', NAME);
  assert.equal(r.ok, false);
});

console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' extract-preview-url check(s) failed\n');
  process.exit(1);
}
console.log('All extract-preview-url checks passed.\n');
