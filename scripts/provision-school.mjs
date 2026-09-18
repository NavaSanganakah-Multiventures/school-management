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

function parseKVId(output) {
  const match = output.match(/id\s*=\s*['"]([a-zA-Z0-9]+)['"]/);
  if (match) return match[1];
  try {
    const json = JSON.parse(output);
    return json.id;
  } catch(e) {}
  const fallback = output.match(/[a-f0-9]{32}/);
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

function getExistingKVId(kvName) {
  try {
    const out = run(`npx wrangler kv:namespace list`);
    const list = JSON.parse(out);
    if (Array.isArray(list)) {
      const match = list.find((k) => k.title === kvName);
      if (match && match.id) return match.id;
    }
  } catch (e) {}
  return null;
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
        const existingKvId = getExistingKVId(kvName);
        if (existingKvId) {
          console.log(`✅ Found existing KV namespace: ${existingKvId}`);
          school.kvNamespaceId = existingKvId;
          updated = true;
        } else {
          try {
            const out = run(`npx wrangler kv:namespace create ${kvName}`);
            const id = parseKVId(out);
            if (id) {
              school.kvNamespaceId = id;
              updated = true;
              console.log(`✅ KV Created: ${id}`);
            } else {
              console.warn(`⚠️ Could not parse KV ID from output: ${out}`);
            }
          } catch (e) {
            if (e.message.includes('already exists')) {
              const fallbackId = getExistingKVId(kvName);
              if (fallbackId) {
                school.kvNamespaceId = fallbackId;
                updated = true;
                console.log(`✅ KV retrieved after already-exists: ${fallbackId}`);
              } else {
                console.error(`⚠️ KV namespace already exists, but could not resolve ID.`);
              }
            } else {
              console.error(`Failed to create KV for ${school.slug}:`, e.message);
            }
          }
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
