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

async function seedTenantData(school, conf, authSecret) {
  if (!authSecret || !school.schoolId) return;
  try {
    console.log(`Checking / seeding tenant data for ${school.slug} (${school.schoolId})...`);
    const res = await globalThis.fetch(`https://pragnya.nasven.com/api/internal/tenant-sync/${encodeURIComponent(school.schoolId)}`, {
      headers: { 'X-Internal-Secret': authSecret },
    });
    if (!res.ok) {
      console.log(`Platform tenant-sync returned ${res.status}. Runtime auto-sync will handle initial data on first request.`);
      return;
    }
    const data = await res.json();
    if (!data || !data.success) {
      console.log('No seed data returned from platform. Will rely on runtime fallback.');
      return;
    }

    const sqlStatements = [];
    const esc = (s) => (s === null || s === undefined) ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;

    if (data.profile) {
      const p = data.profile;
      sqlStatements.push(
        `INSERT OR REPLACE INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, logo_url, updated_at) VALUES (`
        + `${esc(p.id || school.schoolId)}, ${esc(p.school_name || school.name || '')}, ${esc(p.affiliation_number)}, ${esc(p.board_name || 'CBSE')}, ${esc(p.school_code)}, `
        + `${esc(p.email)}, ${esc(p.phone)}, ${esc(p.alternate_phone)}, ${esc(p.address)}, ${esc(p.city)}, ${esc(p.state)}, ${esc(p.pincode)}, `
        + `${esc(p.academic_session || '2026-2027')}, ${esc(p.director_name)}, ${esc(p.principal_name)}, ${esc(p.logo_url)}, ${esc(p.updated_at || new Date().toISOString().split('T')[0])});`
      );
    }

    if (Array.isArray(data.users)) {
      for (const u of data.users) {
        if (!u || !u.id || !u.email) continue;
        sqlStatements.push(
          `INSERT OR REPLACE INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, last_login, created_at, updated_at, password_hash, school_id) VALUES (`
          + `${esc(u.id)}, ${esc(u.username || u.email)}, ${esc(u.full_name || 'User')}, ${esc(String(u.email).toLowerCase())}, ${esc(u.phone)}, `
          + `${esc(u.role || 'Staff')}, ${esc(u.designation)}, ${esc(u.department)}, ${esc(u.qualification)}, ${Number(u.salary || 0)}, `
          + `${esc(u.status || 'Active')}, ${esc(u.last_login)}, ${esc(u.created_at || new Date().toISOString())}, ${esc(u.updated_at || new Date().toISOString())}, `
          + `${esc(u.password_hash)}, ${esc(school.schoolId)});`
        );
      }
    }

    if (sqlStatements.length > 0) {
      const seedFile = `wrangler-${school.slug}.seed.sql`;
      fs.writeFileSync(seedFile, sqlStatements.join('\n'));
      try {
        console.log(`Executing ${sqlStatements.length} seed statements into dedicated DB...`);
        run(`${WRANGLER} d1 execute DB --remote --file=${seedFile} -c ${conf}`);
        console.log(`✅ Seeded ${sqlStatements.length} records into ${school.slug} DB.`);
      } finally {
        fs.rmSync(seedFile, { force: true });
      }
    }
  } catch (err) {
    console.warn(`Warning: Deploy seed skipped for ${school.slug}:`, err.message);
  }
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
      FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON,
      WEB_PUSH_VAPID_PRIVATE_KEY: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
      FIREBASE_WEB_CONFIG_JSON: process.env.FIREBASE_WEB_CONFIG_JSON,
    };
    for (const key of Object.keys(secrets)) {
      if (!secrets[key]) delete secrets[key];
    }

    // Apply D1 migrations first so the schema is ready when the worker goes live.
    run(WRANGLER + ' d1 migrations apply DB --remote -c ' + conf);

    // Seed initial school profile and users into the dedicated DB
    await seedTenantData(school, conf, secrets.AUTH_SECRET);

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
