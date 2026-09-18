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
      console.log(`Generating wrangler-${school.slug}.toml...`);

      const domain = school.domain || `${school.slug}.${sharedDomain}`;
      const toml = `name = "school-management-${school.slug}"
main = "./api/index.ts"
compatibility_date = "2025-01-24"
compatibility_flags = ["nodejs_compat"]

[vars]
APP_BASE_URL = "https://${domain}"
SCHOOL_ID = "${school.schoolId}"
SCHOOL_SLUG = "${school.slug}"
IS_DEDICATED_WORKER = "true"

[[routes]]
pattern = "${domain}/*"
custom_domain = true

[[d1_databases]]
binding = "DB"
database_name = "school-management-${school.slug}-db"
database_id = "${school.d1DatabaseId || ''}"
migrations_dir = "db_migrations"

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "${school.r2BucketName || ''}"

[[kv_namespaces]]
binding = "CONFIG_KV"
id = "${school.kvNamespaceId || ''}"

[site]
bucket = "./out"
`;

      fs.writeFileSync(`wrangler-${school.slug}.toml`, toml);
    }
  }

  console.log("Finished generating dedicated worker configs.");
}

main();
