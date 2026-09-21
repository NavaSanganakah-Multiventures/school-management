/**
 * Pragnya Mitra — cleanup legacy WfP dispatcher worker and routes (idempotent).
 *
 * When transitioning from Workers for Platforms to direct dedicated workers,
 * Cloudflare blocks deploying the shared worker with "*.pragnya.nasven.com/*"
 * if the legacy "school-management-dispatcher" is still bound to that route.
 *
 * This script:
 *   1. Finds the zone id for nasven.com.
 *   2. Lists worker routes in that zone.
 *   3. Deletes any route assigned to "school-management-dispatcher" or
 *      routes for "*.pragnya.nasven.com/*" pointing to the old dispatcher.
 *   4. Deletes the legacy dispatcher worker service if it exists.
 *   5. Deletes the legacy dispatch namespace if it exists.
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
  } catch (_) {
    // Non-JSON response handled below
  }

  if (!response.ok || json.success === false) {
    const status = response.status;
    const errors = Array.isArray(json.errors) ? json.errors : [];
    const messages = Array.isArray(json.messages) ? json.messages : [];
    const detail = errors.concat(messages);
    return { ok: false, status, errors: detail, result: null };
  }
  return { ok: true, status: response.status, result: json.result };
}

function deriveZoneName(domain) {
  const labels = domain.split('.');
  if (labels.length <= 2) return domain;
  return labels.slice(1).join('.');
}

async function main() {
  const accountId = envOrThrow('CLOUDFLARE_ACCOUNT_ID');

  let domain = 'pragnya.nasven.com';
  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      if (registry.sharedWorker?.domain) {
        domain = registry.sharedWorker.domain;
      }
    } catch (_) {}
  }

  const zoneName = process.env.CLOUDFLARE_ZONE_NAME || deriveZoneName(domain);
  console.log(`[Cleanup] Checking for legacy dispatcher routes in zone "${zoneName}"...`);

  // 1. Resolve Zone ID (exact match required)
  const zoneRes = await cf(`${CF_API}/zones?name=${encodeURIComponent(zoneName)}&status=active`);
  if (!zoneRes.ok || !Array.isArray(zoneRes.result) || zoneRes.result.length === 0) {
    console.warn(`[Cleanup] ⚠️ Zone "${zoneName}" not found or token lacks zone permissions. Skipping route cleanup.`);
    return;
  }
  const zone = zoneRes.result.find((z) => z.name === zoneName);
  if (!zone) {
    console.warn(`[Cleanup] ⚠️ Exact zone "${zoneName}" not found in Cloudflare account. Skipping route cleanup.`);
    return;
  }
  const zoneId = zone.id;
  console.log(`[Cleanup] Zone resolved: ${zone.name} (${zoneId})`);

  // 2. Fetch all worker routes in the zone
  const routesRes = await cf(`${CF_API}/zones/${zoneId}/workers/routes`);
  if (routesRes.ok && Array.isArray(routesRes.result)) {
    const routes = routesRes.result;
    for (const route of routes) {
      // Only delete routes explicitly assigned to the legacy dispatcher worker
      const isDispatcherRoute = route.script === 'school-management-dispatcher';

      if (isDispatcherRoute) {
        console.log(`[Cleanup] Deleting conflicting legacy route: ${route.pattern} -> ${route.script} (${route.id})`);
        const delRes = await cf(`${CF_API}/zones/${zoneId}/workers/routes/${route.id}`, { method: 'DELETE' });
        if (delRes.ok) {
          console.log(`[Cleanup] ✅ Successfully deleted route: ${route.pattern}`);
        } else {
          console.warn(`[Cleanup] ⚠️ Failed to delete route ${route.id}:`, delRes.errors);
        }
      }
    }
  } else {
    console.log('[Cleanup] No routes found or failed to list routes.');
  }

  // 3. Delete legacy dispatcher worker service (if present)
  console.log('[Cleanup] Checking legacy worker service "school-management-dispatcher"...');
  const serviceDel = await cf(`${CF_API}/accounts/${accountId}/workers/services/school-management-dispatcher`, {
    method: 'DELETE',
  });
  if (serviceDel.ok) {
    console.log('[Cleanup] ✅ Deleted legacy worker "school-management-dispatcher".');
  } else if (serviceDel.status === 404 || serviceDel.errors?.some((e) => e?.code === 10007 || /not found/i.test(e?.message))) {
    console.log('[Cleanup] Legacy worker "school-management-dispatcher" not found or already deleted.');
  } else {
    console.warn('[Cleanup] ⚠️ Could not delete legacy worker service:', serviceDel.errors);
  }

  // 4. Delete legacy dispatch namespace (if present)
  console.log('[Cleanup] Checking legacy dispatch namespace "school-management-dispatch"...');
  const nsDel = await cf(`${CF_API}/accounts/${accountId}/workers/dispatch/namespaces/school-management-dispatch`, {
    method: 'DELETE',
  });
  if (nsDel.ok) {
    console.log('[Cleanup] ✅ Deleted legacy dispatch namespace "school-management-dispatch".');
  } else if (nsDel.status === 404 || nsDel.errors?.some((e) => e?.code === 10007 || /not found/i.test(e?.message))) {
    console.log('[Cleanup] Legacy dispatch namespace not found or already deleted.');
  } else {
    console.warn('[Cleanup] ⚠️ Could not delete dispatch namespace:', nsDel.errors);
  }

  console.log('[Cleanup] Finished legacy dispatcher cleanup.');
}

main().catch((err) => {
  console.error('[Cleanup] Fatal error during cleanup:', err);
  process.exit(1);
});
