/**
 * Cloudflare REST API v4 Orchestrator Client for Pragnya Mitra
 * 
 * Provides automated provisioning of dedicated D1 databases, R2 media buckets,
 * KV namespaces, and Worker secret injection per school.
 */

export interface CloudflareApiConfig {
  accountId: string;
  apiToken: string;
}

/**
 * Retries a fetch call with exponential backoff on transient failures (5xx, 429, network errors).
 */
async function fetchWithRetry(
  fn: () => Promise<Response>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<Response> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fn();
      if (attempt < maxRetries && (res.status === 429 || res.status >= 500)) {
        const retryAfter = res.headers.get('Retry-After');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error('fetchWithRetry: सभी प्रयास विफल।');
}

export function getCloudflareConfig(c: any): CloudflareApiConfig | null {
  const accountId = (c.env && (c.env.CLOUDFLARE_ACCOUNT_ID || c.env.CF_ACCOUNT_ID)) || '';
  const apiToken = (c.env && (c.env.CLOUDFLARE_API_TOKEN || c.env.CF_API_TOKEN)) || '';
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

/**
 * Creates a new dedicated Cloudflare D1 Database for a school.
 */
export async function createDedicatedD1Database(
  config: CloudflareApiConfig,
  databaseName: string
): Promise<{ success: boolean; uuid: string; name: string; error?: string }> {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database`;
    const res = await fetchWithRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: databaseName }),
    }));

    const data = await res.json() as any;
    if (data.success && data.result) {
      return {
        success: true,
        uuid: data.result.uuid,
        name: data.result.name,
      };
    }

    return {
      success: false,
      uuid: '',
      name: databaseName,
      error: data.errors?.[0]?.message || 'D1 डेटाबेस निर्माण विफल रहा।',
    };
  } catch (err: any) {
    return { success: false, uuid: '', name: databaseName, error: err?.message || String(err) };
  }
}

/**
 * Creates a new dedicated Cloudflare R2 Media Bucket for a school.
 * Uses POST /r2/buckets with bucket name in body per Cloudflare API v4 docs.
 */
export async function createDedicatedR2Bucket(
  config: CloudflareApiConfig,
  bucketName: string
): Promise<{ success: boolean; name: string; error?: string }> {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets`;
    const res = await fetchWithRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: bucketName }),
    }));

    const data = await res.json() as any;
    if (data.success) {
      return { success: true, name: bucketName };
    }

    // 409 usually indicates bucket already exists (which is fine — idempotent)
    if (res.status === 409) {
      return { success: true, name: bucketName };
    }

    return {
      success: false,
      name: bucketName,
      error: data.errors?.[0]?.message || 'R2 बकेट निर्माण विफल रहा।',
    };
  } catch (err: any) {
    return { success: false, name: bucketName, error: err?.message || String(err) };
  }
}

/**
 * Injects or updates a Worker Secret via Cloudflare API.
 */
export async function putWorkerSecret(
  config: CloudflareApiConfig,
  scriptName: string,
  secretName: string,
  secretText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${scriptName}/secrets`;
    const res = await fetchWithRetry(() => fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: secretName,
        text: secretText,
        type: 'secret_text',
      }),
    }));

    const data = await res.json() as any;
    if (data.success) {
      return { success: true };
    }

    return { success: false, error: data.errors?.[0]?.message || 'Secret अद्यतन विफल रहा।' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

