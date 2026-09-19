import fs from 'fs';
import { execSync } from 'child_process';

const REGISTRY_FILE = 'schools.json';

function run(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function parseD1Id(output) {
  const match = output.match(/database_id[=:\s]+['"]?([a-zA-Z0-9-]+)['"]?/);
  if (match) return match[1];
  try {
    const json = JSON.parse(output);
    return json.uuid || json.id;
  } catch(e) {}
  const fallback = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  return fallback ? fallback[0] : null;
}

function getExistingD1Id(dbName) {
  try {
    const out = run(`npx wrangler d1 info ${dbName} --json`);
    const json = JSON.parse(out);
    return json.uuid || json.id;
  } catch (e) {
    return null;
  }
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

function cfAccount() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set');
  }
  return { token, baseUrl: CF_API_BASE + '/' + accountId };
}

async function getExistingKVId(kvName) {
  const { token, baseUrl } = cfAccount();
  const res = await globalThis.fetch(baseUrl + '/storage/kv/namespaces?per_page=100&page=1', {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const json = await res.json();
  const list = json && json.success && Array.isArray(json.result) ? json.result : [];
  const match = list.find((k) => k.title === kvName);
  return match && match.id ? match.id : null;
}

async function createKVNamespace(kvName) {
  const { token, baseUrl } = cfAccount();
  const res = await globalThis.fetch(baseUrl + '/storage/kv/namespaces', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: kvName }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    const msg = json && json.errors && json.errors[0] ? json.errors[0].message : ('HTTP ' + res.status);
    throw new Error(msg);
  }
  return json.result && json.result.id ? json.result.id : null;
}

async function main() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error(`Registry file ${REGISTRY_FILE} not found.`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  let updated = false;

  for (const school of registry.schools) {
    if (school.mode === 'dedicated') {
      console.log(`\nChecking dedicated resources for ${school.slug}...`);

      const dbName = `school-management-${school.slug}-db`;
      const bucketName = `school-management-${school.slug}-media`;
      const kvName = `school-management-${school.slug}-config`;

      if (!school.d1DatabaseId) {
        console.log(`Provisioning D1 database: ${dbName}`);

        // Try to fetch existing first
        const existingId = getExistingD1Id(dbName);
        if (existingId) {
           console.log(`✅ Found existing D1: ${existingId}`);
           school.d1DatabaseId = existingId;
           updated = true;
        } else {
           try {
             const out = run(`npx wrangler d1 create ${dbName}`);
             const id = parseD1Id(out);
             if (id) {
               school.d1DatabaseId = id;
               updated = true;
               console.log(`✅ D1 Created: ${id}`);
             } else {
               console.warn(`⚠️ Could not parse D1 ID from output: ${out}`);
             }
           } catch (e) {
             console.error(`Failed to create D1 for ${school.slug}:`, e.message);
           }
        }
      } else {
        console.log(`✅ D1 already provisioned: ${school.d1DatabaseId}`);
      }

      if (!school.r2BucketName) {
        console.log(`Provisioning R2 bucket: ${bucketName}`);
        try {
          run(`npx wrangler r2 bucket create ${bucketName}`);
          school.r2BucketName = bucketName;
          updated = true;
          console.log(`✅ R2 Created: ${bucketName}`);
        } catch (e) {
          if (e.message.includes('already exists')) {
             school.r2BucketName = bucketName;
             updated = true;
             console.log(`✅ R2 already existed: ${bucketName}`);
          } else {
             console.error(`Failed to create R2 for ${school.slug}:`, e.message);
          }
        }
      } else {
        console.log(`✅ R2 already provisioned: ${school.r2BucketName}`);
      }

      if (!school.kvNamespaceId) {
        console.log(`Provisioning KV namespace: ${kvName}`);
        try {
          let id = await getExistingKVId(kvName);
          if (id) {
            console.log(`✅ Found existing KV namespace: ${id}`);
          } else {
            try {
              id = await createKVNamespace(kvName);
              if (id) {
                console.log(`✅ KV Created: ${id}`);
              }
            } catch (e) {
              if (/already exists|10014/i.test(e.message)) {
                id = await getExistingKVId(kvName);
                if (id) {
                  console.log(`✅ KV retrieved after already-exists: ${id}`);
                }
              } else {
                throw e;
              }
            }
          }
          if (id) {
            school.kvNamespaceId = id;
            updated = true;
          } else {
            console.warn(`⚠️ Could not resolve KV namespace id for ${kvName}`);
          }
        } catch (e) {
          console.error(`Failed to provision KV for ${school.slug}:`, e.message);
        }
      } else {
        console.log(`✅ KV already provisioned: ${school.kvNamespaceId}`);
      }
    }
  }

  if (updated) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
    console.log(`\nUpdated ${REGISTRY_FILE} with new resource IDs.`);
  } else {
    console.log(`\nNo new resources needed to be provisioned.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
