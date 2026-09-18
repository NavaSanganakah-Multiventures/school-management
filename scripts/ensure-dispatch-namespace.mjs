/**
 * VidyaSetu — ensure the Workers for Platforms dispatch namespace exists (idempotent).
 *
 * Reads schools.json sharedWorker.dispatchNamespace and creates it via the Cloudflare
 * REST API if missing (list first, then create).
 *
 * Required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 */
import fs from 'fs';

const REGISTRY_FILE = 'schools.json';
const CF_API = 'https://api.cloudflare.com/client/v4';

function envOrThrow(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error('Missing required environment variable: ' + name);
  }
  return value;
}

async function cf(path, { method = 'GET', body } = {}) {
  const accountId = envOrThrow('CLOUDFLARE_ACCOUNT_ID');
  const token = envOrThrow('CLOUDFLARE_API_TOKEN');

  const response = await fetch(CF_API + '/accounts/' + accountId + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json = {};
  try {
    json = await response.json();
  } catch {}

  if (!response.ok || json.success === false) {
    const detail = [...(json.errors || []), ...(json.messages || [])];
    throw new Error(
      'Cloudflare API ' + method + ' ' + path + ' failed (' + response.status + '): ' + JSON.stringify(detail),
    );
  }
  return json;
}

async function main() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error('Registry file ' + REGISTRY_FILE + ' not found.');
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  const namespace = registry.sharedWorker?.dispatchNamespace || 'school-management-dispatch';

  const list = await cf('/workers/dispatch/namespaces');
  const existing = (list.result || []).find(
    (n) => n.namespace_name === namespace || n.name === namespace,
  );

  if (existing) {
    console.log('✅ Dispatch namespace already exists: ' + namespace + ' (' + existing.namespace_id + ')');
    return;
  }

  const created = await cf('/workers/dispatch/namespaces', {
    method: 'POST',
    body: { name: namespace },
  });

  console.log('✅ Created dispatch namespace: ' + namespace + ' (' + created.result?.namespace_id + ')');
}

main().catch((err) => {
  console.error('ensure-dispatch-namespace failed:', err);
  process.exit(1);
});
