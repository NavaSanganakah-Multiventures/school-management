/**
 * Pragnya Mitra — seed app secrets into the central CONFIG_KV namespace.
 *
 * Run this once (locally or in CI) to populate KV with secret values. After
 * seeding, scripts/sync-kv-to-github.mjs pushes them to GitHub repo secrets,
 * which the existing deploy workflow reads (unchanged).
 *
 * KV key names MUST match the GitHub repo secret names that deploy.yml expects.
 *
 * Usage (values from environment):
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *   AUTH_SECRET=... RAZORPAY_KEY_ID=... ... node scripts/seed-kv-secrets.mjs
 *
 * Usage (values from a JSON file — keys = secret names):
 *   node scripts/seed-kv-secrets.mjs --file secrets.json
 *
 * Optional:
 *   KV_NAMESPACE_ID=...   (default: production CONFIG_KV from wrangler.toml)
 *   --dry-run             print what would be uploaded without writing
 */
import fs from 'fs';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const DEFAULT_KV_NAMESPACE_ID = '393901911be84d558822c78070a82e94';

// KV keys = GitHub repo secret names used by .github/workflows/deploy.yml.
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID stay as GitHub secrets (access creds).
const SECRET_KEYS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'AUTH_SECRET',
  'PLATFORM_ADMIN_EMAIL',
  'PLATFORM_ADMIN_PASSWORD',
  'FCM_SERVICE_ACCOUNT_JSON',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
  'FIREBASE_WEB_CONFIG_JSON',
  'PROVISIONING_GITHUB_TOKEN',
  'DEDICATED_SECRETS_JSON',
];

function serializeSecretValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function parseArgs(argv) {
  const args = { file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        throw new Error('--file flag requires a file path argument');
      }
      args.file = argv[++i];
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

async function putKV(namespaceId, key, value, token, accountId) {
  const url = `${CF_API_BASE}/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const res = await globalThis.fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
    body: value,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`KV PUT "${key}" failed: ${res.status} ${body}`);
  }
  return true;
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.KV_NAMESPACE_ID || DEFAULT_KV_NAMESPACE_ID;
  if (!token || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set');
  }

  let fileValues = {};
  if (file) {
    if (!fs.existsSync(file)) throw new Error('File not found: ' + file);
    try {
      fileValues = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
      throw new Error(`Failed to parse JSON secrets file "${file}": ${err.message}`);
    }
  }

  const uploaded = [];
  const skipped = [];
  for (const key of SECRET_KEYS) {
    const rawValue = file && fileValues[key] !== undefined
      ? fileValues[key]
      : (process.env[key] !== undefined ? process.env[key] : null);
    const value = serializeSecretValue(rawValue);
    if (value === null || value === '') {
      skipped.push(key);
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] would upload "${key}" (${value.length} bytes)`);
      uploaded.push(key);
      continue;
    }
    await putKV(namespaceId, key, value, token, accountId);
    console.log(`uploaded "${key}" (${value.length} bytes)`);
    uploaded.push(key);
  }

  console.log(`\nDone. Uploaded ${uploaded.length}, skipped ${skipped.length}.`);
  if (skipped.length) console.log('Skipped (no value): ' + skipped.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
