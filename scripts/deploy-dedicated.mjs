/**
 * VidyaSetu — deploy dedicated (Enterprise) schools as Workers for Platforms user workers.
 *
 * For each dedicated school this script:
 *   1. writes a per-school secrets file (JSON),
 *   2. applies D1 migrations,
 *   3. uploads the user worker into the dispatch namespace via
 *      wrangler deploy --dispatch-namespace <ns> --secrets-file <file> -c wrangler-<slug>.toml.
 *
 * Required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 * Optional env vars: DEDICATED_SECRETS_JSON, RAZORPAY_KEY_ID/SECRET, AUTH_SECRET,
 *   FCM_SERVICE_ACCOUNT_JSON, WEB_PUSH_VAPID_PRIVATE_KEY, FIREBASE_WEB_CONFIG_JSON
 */
import fs from 'fs';
import { execSync } from 'child_process';

const REGISTRY_FILE = 'schools.json';
// WfP deploy flags (--dispatch-namespace, --secrets-file) need wrangler 4.x.
const WRANGLER = 'npx --yes wrangler@4';

function run(cmd) {
  console.log('> ' + cmd);
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', env: process.env });
}

async function main() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error('Registry file ' + REGISTRY_FILE + ' not found.');
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  const namespace = registry.sharedWorker?.dispatchNamespace || 'school-management-dispatch';
  const SECRETS_JSON = process.env.DEDICATED_SECRETS_JSON
    ? JSON.parse(process.env.DEDICATED_SECRETS_JSON)
    : {};

  for (const school of registry.schools) {
    if (school.mode !== 'dedicated') continue;

    const slug = school.slug;
    const conf = 'wrangler-' + slug + '.toml';
    if (!fs.existsSync(conf)) {
      console.error('Missing config ' + conf + ' — run "node scripts/generate-school-configs.mjs" first.');
      continue;
    }

    console.log('\n=== Deploying Dedicated (WfP) Worker: ' + slug + ' ===\n');

    const schoolSecrets = SECRETS_JSON[slug] || {};
    const secrets = {
      RAZORPAY_KEY_ID: schoolSecrets.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET: schoolSecrets.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET,
      AUTH_SECRET: schoolSecrets.AUTH_SECRET || process.env.AUTH_SECRET,
      INTERNAL_SYNC_SECRET: schoolSecrets.INTERNAL_SYNC_SECRET || process.env.INTERNAL_SYNC_SECRET,
      FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON,
      WEB_PUSH_VAPID_PRIVATE_KEY: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
      FIREBASE_WEB_CONFIG_JSON: process.env.FIREBASE_WEB_CONFIG_JSON,
    };
    for (const key of Object.keys(secrets)) {
      if (!secrets[key]) delete secrets[key];
    }

    // Apply D1 migrations first so the schema is ready when the worker goes live.
    run(WRANGLER + ' d1 migrations apply DB --remote -c ' + conf);

    if (Object.keys(secrets).length > 0) {
      const secretsFile = 'wrangler-' + slug + '.secrets.json';
      fs.writeFileSync(secretsFile, JSON.stringify(secrets));
      try {
        run(WRANGLER + ' deploy --dispatch-namespace ' + namespace + ' --secrets-file ' + secretsFile + ' -c ' + conf);
      } finally {
        fs.rmSync(secretsFile, { force: true });
      }
    } else {
      run(WRANGLER + ' deploy --dispatch-namespace ' + namespace + ' -c ' + conf);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
