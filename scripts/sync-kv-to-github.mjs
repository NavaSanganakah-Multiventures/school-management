/**
 * VidyaSetu — sync app secrets from Cloudflare KV to GitHub repository secrets.
 *
 * KV is the single source of truth. This script reads each secret from KV and
 * writes it to the GitHub repo (actions) secrets via `gh secret set`, so the
 * existing deploy workflow can read them from `${{ secrets.XXX }}` unchanged.
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  — read KV
 *   GH_TOKEN (or GITHUB_TOKEN)                    — PAT with repo/admin scope to write secrets
 *   GITHUB_REPOSITORY                            — "owner/repo" (auto-set in Actions; set manually for local use)
 *
 * Optional:
 *   KV_NAMESPACE_ID  (default: production CONFIG_KV from wrangler.toml)
 *   --dry-run        print what would be synced without writing to GitHub
 */
import { spawnSync } from 'child_process';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const DEFAULT_KV_NAMESPACE_ID = '393901911be84d55822c78070a82e94';

// KV keys = GitHub repo secret names that deploy.yml reads.
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

async function fetchKV(namespaceId, key, token, accountId) {
  const url = `${CF_API_BASE}/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const res = await globalThis.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`KV GET "${key}" failed: ${res.status} ${body}`);
  }
  return await res.text();
}

function ghSecretSet(name, value, repo) {
  // Value piped via stdin so it never appears in process arguments / logs.
  const res = spawnSync('gh', ['secret', 'set', name, '--repo', repo], {
    input: value,
    encoding: 'utf-8',
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`gh secret set "${name}" failed: ${(res.stderr || res.stdout || '').trim()}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.KV_NAMESPACE_ID || DEFAULT_KV_NAMESPACE_ID;
  const repo = process.env.GITHUB_REPOSITORY;
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || !accountId) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set');
  if (!repo) throw new Error('GITHUB_REPOSITORY must be set (owner/repo)');
  if (!ghToken) {
    console.warn('⚠️ GH_TOKEN (or GITHUB_TOKEN) is not set — skipping secrets sync.');
    return;
  }

  const synced = [];
  const missing = [];

  const kvEntries = await Promise.all(
    SECRET_KEYS.map(async (key) => {
      const value = await fetchKV(namespaceId, key, token, accountId);
      return { key, value };
    })
  );

  for (const { key, value } of kvEntries) {
    if (value === null || value === '') {
      missing.push(key);
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] would sync "${key}" (${value.length} bytes) → GitHub repo secret`);
      synced.push(key);
      continue;
    }
    ghSecretSet(key, value, repo);
    console.log(`synced "${key}" → GitHub repo secret`);
    synced.push(key);
  }

  console.log(`\nDone. Synced ${synced.length}, missing ${missing.length}.`);
  if (missing.length) console.log('Not found in KV (skipped): ' + missing.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
