import fs from 'fs';

const REGISTRY_FILE = 'schools.json';

function main() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error(`Registry file ${REGISTRY_FILE} not found.`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  const sharedDomain = registry.sharedWorker.domain;

  for (const school of registry.schools) {
    if (school.mode === 'dedicated') {
      if (!school.slug || !school.schoolId) {
        console.warn(`⚠️ Skipping invalid dedicated school entry (missing slug or schoolId):`, school);
        continue;
      }

      if (!school.d1DatabaseId) {
        console.warn(`⚠️ School ${school.slug} is dedicated but D1 is not provisioned yet. Run "node scripts/provision-school.mjs" first.`);
        continue;
      }

      console.log(`Generating wrangler-${school.slug}.toml...`);

      const domain = school.domain || `${school.slug}.${sharedDomain}`;
      const toml = `name = ${JSON.stringify(`school-management-${school.slug}`)}
main = "./api/index.ts"
compatibility_date = "2025-01-24"
compatibility_flags = ["nodejs_compat"]

[vars]
APP_BASE_URL = ${JSON.stringify(`https://${domain}`)}
SCHOOL_ID = ${JSON.stringify(school.schoolId)}
SCHOOL_SLUG = ${JSON.stringify(school.slug)}
IS_DEDICATED_WORKER = "true"

[[routes]]
pattern = ${JSON.stringify(`${domain}/*`)}
custom_domain = true

[[d1_databases]]
binding = "DB"
database_name = ${JSON.stringify(`school-management-${school.slug}-db`)}
database_id = ${JSON.stringify(school.d1DatabaseId)}
migrations_dir = "db_migrations"

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = ${JSON.stringify(school.r2BucketName || `school-management-${school.slug}-media`)}

[[kv_namespaces]]
binding = "CONFIG_KV"
id = ${JSON.stringify(school.kvNamespaceId || '')}

[site]
bucket = "./out"
`;

      fs.writeFileSync(`wrangler-${school.slug}.toml`, toml);
    }
  }

  console.log("Finished generating dedicated worker configs.");
}

main();
