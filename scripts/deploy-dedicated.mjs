import fs from 'fs';
import { execSync } from 'child_process';

const REGISTRY_FILE = 'schools.json';

function run(cmd, envs) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', env: { ...process.env, ...envs } });
}

function runWithSecret(cmd, secretValue) {
  return execSync(cmd, { input: secretValue, encoding: 'utf-8', stdio: ['pipe', 'inherit', 'inherit'], env: process.env });
}

async function main() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error(`Registry file ${REGISTRY_FILE} not found.`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  const SECRETS_JSON = process.env.DEDICATED_SECRETS_JSON ? JSON.parse(process.env.DEDICATED_SECRETS_JSON) : {};

  for (const school of registry.schools) {
    if (school.mode === 'dedicated') {
      const slug = school.slug;
      const conf = `wrangler-${slug}.toml`;
      if (!fs.existsSync(conf)) {
         console.error(`Missing config ${conf}`);
         continue;
      }

      console.log(`\n=== Deploying Dedicated Worker: ${slug} ===\n`);

      run(`npx --yes wrangler@3.90.0 d1 migrations apply DB --remote -c ${conf}`);
      run(`npx --yes wrangler@3.90.0 deploy -c ${conf}`);

      const schoolSecrets = SECRETS_JSON[slug] || {};

      const rzpId = schoolSecrets.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
      const rzpSec = schoolSecrets.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
      const authSec = schoolSecrets.AUTH_SECRET || process.env.AUTH_SECRET;

      if(rzpId) { console.log(`Setting RAZORPAY_KEY_ID for ${slug}`); runWithSecret(`npx --yes wrangler@3.90.0 secret put RAZORPAY_KEY_ID -c ${conf}`, rzpId); }
      if(rzpSec) { console.log(`Setting RAZORPAY_KEY_SECRET for ${slug}`); runWithSecret(`npx --yes wrangler@3.90.0 secret put RAZORPAY_KEY_SECRET -c ${conf}`, rzpSec); }
      if(authSec) { console.log(`Setting AUTH_SECRET for ${slug}`); runWithSecret(`npx --yes wrangler@3.90.0 secret put AUTH_SECRET -c ${conf}`, authSec); }

      if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
         console.log(`Setting FCM_SERVICE_ACCOUNT_JSON for ${slug}`);
         runWithSecret(`npx --yes wrangler@3.90.0 secret put FCM_SERVICE_ACCOUNT_JSON -c ${conf}`, process.env.FCM_SERVICE_ACCOUNT_JSON);
      }
      if (process.env.WEB_PUSH_VAPID_PRIVATE_KEY) {
         console.log(`Setting WEB_PUSH_VAPID_PRIVATE_KEY for ${slug}`);
         runWithSecret(`npx --yes wrangler@3.90.0 secret put WEB_PUSH_VAPID_PRIVATE_KEY -c ${conf}`, process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
      }
      if (process.env.FIREBASE_WEB_CONFIG_JSON) {
         console.log(`Setting FIREBASE_WEB_CONFIG_JSON for ${slug}`);
         runWithSecret(`npx --yes wrangler@3.90.0 secret put FIREBASE_WEB_CONFIG_JSON -c ${conf}`, process.env.FIREBASE_WEB_CONFIG_JSON);
      }
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
