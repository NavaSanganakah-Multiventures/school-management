/**
 * Pragnya Mitra — ensure the wildcard DNS record for dedicated school subdomains exists (idempotent).
 *
 * Cloudflare Worker routes can only serve a hostname when a (proxied) DNS record exists
 * for it. The shared worker and dedicated-school workers deploy direct routes on
 * "*.pragnya.nasven.com", so if the "*.pragnya.nasven.com" DNS record is missing,
 * requests to <slug>.pragnya.nasven.com fail with DNS NXDOMAIN / Cloudflare error 1016
 * and the provisioning health check never reports the dedicated worker as live (status
 * stays "pending" / "deploy ho raha hai").
 *
 * This script reads schools.json sharedWorker.domain (e.g. pragnya.nasven.com), derives the
 * Cloudflare zone (the parent domain, e.g. nasven.com), and creates a proxied wildcard A
 * record if it does not exist yet (or enables proxy on it if it was created grey-clouded).
 *
 * Required env vars: CLOUDFLARE_API_TOKEN
 * Optional env vars: CLOUDFLARE_ZONE_NAME (override derived zone)
 */
import fs from 'fs';

const REGISTRY_FILE = 'schools.json';
const CF_API = 'https://api.cloudflare.com/client/v4';
const PLACEHOLDER_ORIGIN_IP = '192.0.2.1'; // TEST-NET-1; proxied records never hit this origin.

function envOrThrow(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error('Missing required environment variable: ' + name);
  }
  return value;
}

async function cf(url, { method = 'GET', body } = {}) {
  const token = envOrThrow('CLOUDFLARE_API_TOKEN');
  const response = await fetch(url, {
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
  } catch (e) {
    // ignore non-JSON responses; the status check below will surface the real error
  }

  if (!response.ok || json.success === false) {
    const detail = (json.errors || []).concat(json.messages || []);
    throw new Error(
      'Cloudflare API ' + method + ' ' + url + ' failed (' + response.status + '): ' + JSON.stringify(detail),
    );
  }
  return json;
}

function deriveZoneName(domain) {
  const labels = domain.split('.');
  if (labels.length < 2) {
    throw new Error('Cannot derive a parent zone from domain: ' + domain);
  }
  if (labels.length === 2) {
    return domain;
  }
  return labels.slice(1).join('.');
}

async function main() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error('Registry file ' + REGISTRY_FILE + ' not found.');
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  const domain = registry.sharedWorker && registry.sharedWorker.domain
    ? registry.sharedWorker.domain
    : 'pragnya.nasven.com';
  const zoneName = process.env.CLOUDFLARE_ZONE_NAME || deriveZoneName(domain);
  const wildcardName = '*.' + domain;

  console.log('Ensuring wildcard DNS record ' + wildcardName + ' on zone ' + zoneName + '...');

  // 1. Resolve the zone id.
  const zones = await cf(CF_API + '/zones?name=' + zoneName + '&status=active');
  const zone = (zones.result || []).find(function (z) { return z.name === zoneName; });
  if (!zone) {
    throw new Error(
      'Cloudflare zone "' + zoneName + '" not found. Check CLOUDFLARE_ZONE_NAME and that the API token has Zone:Read permission.',
    );
  }
  console.log('Found zone: ' + zone.name + ' (' + zone.id + ')');

  // 2. Look for an existing wildcard A record.
  const existingList = await cf(
    CF_API + '/zones/' + zone.id + '/dns_records?type=A&name=' + wildcardName,
  );
  const existing = (existingList.result || []).find(function (r) {
    return r.type === 'A' && r.name === wildcardName;
  });

  if (existing) {
    if (existing.proxied) {
      console.log('✅ Wildcard DNS record already proxied: ' + wildcardName);
      return;
    }
    await cf(CF_API + '/zones/' + zone.id + '/dns_records/' + existing.id, {
      method: 'PATCH',
      body: { proxied: true, ttl: 1 },
    });
    console.log('✅ Enabled proxy (orange cloud) on existing record ' + wildcardName);
    return;
  }

  // 3. Create the proxied wildcard A record.
  await cf(CF_API + '/zones/' + zone.id + '/dns_records', {
    method: 'POST',
    body: {
      type: 'A',
      name: wildcardName,
      content: PLACEHOLDER_ORIGIN_IP,
      ttl: 1,
      proxied: true,
    },
  });
  console.log('✅ Created proxied wildcard DNS record: ' + wildcardName + ' → ' + PLACEHOLDER_ORIGIN_IP);
}

main().catch(function (err) {
  console.error('ensure-wildcard-dns failed:', err);
  process.exit(1);
});
