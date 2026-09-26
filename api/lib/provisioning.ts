// api/lib/provisioning.ts
// Shared helper for provisioning dedicated Cloudflare Workers.
// Every school gets its own dedicated worker (D1/R2/KV + <slug>.pragnya.nasven.com),
// regardless of plan. Used by billing (payment activation) and admin
// (auto-provision on create/approve/plan-assign + manual provision retry).

export type ProvisioningStatus = 'skipped' | 'started' | 'error';

export interface ProvisioningResult {
  ok: boolean;
  status: ProvisioningStatus;
  slug?: string;
  domain?: string;
  message?: string;
  error?: string;
}

export function sanitizeSlug(s: string): string {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Slugs the platform owns. A school may never claim one of these.
 *
 * WHY THIS EXISTS
 * Every dedicated school gets `<slug>.pragnya.nasven.com`, and its generated
 * wrangler config declares that route. A school registered with slug `admin`
 * therefore produced `wrangler-admin.toml` claiming
 * `admin.pragnya.nasven.com/*`, which the Super Admin console worker already
 * owns. `scripts/deploy-dedicated.mjs` then aborted with
 *
 *     Can't deploy routes that are assigned to another worker.
 *
 * and because that is a single loop over every school, the ONE bad entry stopped
 * the entire fleet from deploying — so no school received the authorization and
 * payment-integrity fixes either. A single school slug is therefore a
 * fleet-wide denial of service on releases.
 *
 * The apex domain and `www` are included for the same reason: they are the public
 * website, not a tenant subdomain.
 */
export const RESERVED_SLUGS = new Set<string>([
  'admin',
  'api',
  'app',
  'assets',
  'cdn',
  'docs',
  'help',
  'mail',
  'media',
  'pragnya',
  'static',
  'status',
  'support',
  'www',
]);

export function isSlugValid(slug: string): boolean {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return true;
}

/** Human-readable reason a slug is unusable, or '' when it is fine. */
export function slugRejectionReason(slug: string): string {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return 'slug khali hai।';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) {
    return 'slug mein sirf a-z, 0-9 aur "-" ho sakte hain, aur shuru/antar mein "-" nahi।';
  }
  if (RESERVED_SLUGS.has(s)) {
    return 'slug "' + s + '" platform ke liye reserve hai (Super Admin console / public website)।';
  }
  return '';
}

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function ghHeaders(token: string) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pragnya-mitra-admin',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function readSchoolsRegistry(token: string, repo: string, branch: string) {
  const url = 'https://api.github.com/repos/' + repo + '/contents/schools.json?ref=' + encodeURIComponent(branch);
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.message || ''; } catch (e) { /* ignore */ }
    throw new Error('schools.json पढ़ने में असमर्थ (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const j = await res.json();
  const registry = JSON.parse(base64ToUtf8(j.content || ''));
  return { registry, sha: String(j.sha || '') };
}

async function commitSchoolsRegistry(token: string, repo: string, branch: string, registry: any, sha: string, message: string) {
  const url = 'https://api.github.com/repos/' + repo + '/contents/schools.json';
  const res = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({
      message,
      content: utf8ToBase64(JSON.stringify(registry, null, 2) + '\n'),
      sha,
      branch,
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.message || ''; } catch (e) { /* ignore */ }
    throw new Error('schools.json commit विफल (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
}

async function markProvisioningPending(db: any, schoolId: string, slug: string, domain: string) {
  if (!db) return;
  try {
    await db.prepare('UPDATE school_tenants SET provisioning_status=?, dedicated_slug=?, dedicated_domain=?, provisioned_at=?, provisioning_error=? WHERE id=?')
      .bind('pending', slug, domain, new Date().toISOString(), '', schoolId).run();
  } catch (e) { /* non-fatal */ }
}

async function markProvisioningFailed(db: any, schoolId: string, error: string) {
  if (!db) return;
  try {
    await db.prepare('UPDATE school_tenants SET provisioning_status=?, provisioning_error=? WHERE id=?')
      .bind('failed', String(error || '').slice(0, 1000), schoolId).run();
  } catch (e) { /* non-fatal */ }
}

export async function provisionDedicatedWorker(
  env: any,
  db: any,
  school: any,
  opts: { slug?: string; domain?: string } = {},
): Promise<ProvisioningResult> {
  const schoolId = String((school && school.id) || '');
  if (!schoolId) return { ok: false, status: 'error', error: 'schoolId उपलब्ध नहीं है।' };

  // No plan-based gating: every school (trial/starter/pro/enterprise) runs on
  // its own dedicated worker. Provisioning is the default for all schools.

  const currentStatus = String((school && school.provisioning_status) || 'none');
  if ((currentStatus === 'pending' || currentStatus === 'live') && (school && school.dedicated_slug)) {
    return {
      ok: true,
      status: 'skipped',
      slug: String(school.dedicated_slug),
      domain: String(school.dedicated_domain || ''),
      message: 'Dedicated worker पहले से provisioned/provisioning में है।',
    };
  }

  const slug = sanitizeSlug(String(opts.slug || (school && school.subdomain) || (school && school.school_name) || ''));
  if (!isSlugValid(slug)) {
    return { ok: false, status: 'error', error: 'अमान्य slug: ' + slug };
  }

  const domain = String(opts.domain || (slug + '.pragnya.nasven.com')).trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return { ok: false, status: 'error', error: 'अमान्य डोमेन: ' + domain };
  }

  const token = String((env && env.GITHUB_TOKEN) || '').trim();
  if (!token) {
    await markProvisioningFailed(db, schoolId, 'GITHUB_TOKEN worker secret सेट नहीं है।');
    return { ok: false, status: 'error', error: 'GITHUB_TOKEN worker secret सेट नहीं है।' };
  }

  const repo = String((env && env.GITHUB_REPO) || 'NavaSanganakah-Multiventures/school-management').trim();
  const branch = String((env && env.GITHUB_BRANCH) || 'main').trim();

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { registry, sha } = await readSchoolsRegistry(token, repo, branch);
      const schools = Array.isArray(registry.schools) ? registry.schools : [];

      const bySlug = schools.find((x: any) => x && x.slug === slug);
      if (bySlug && bySlug.schoolId !== schoolId && bySlug.mode === 'dedicated') {
        return { ok: false, status: 'error', error: 'यह slug पहले से किसी अन्य dedicated स्कूल को आवंटित है: ' + slug };
      }

      const entry = schools.find((x: any) => x && x.schoolId === schoolId) || bySlug;
      if (entry) {
        entry.slug = slug;
        entry.schoolId = schoolId;
        entry.mode = 'dedicated';
        entry.name = (school && school.school_name) || entry.name || '';
        entry.domain = domain;
      } else {
        schools.push({ slug, schoolId, mode: 'dedicated', name: (school && school.school_name) || '', domain });
      }
      registry.schools = schools;

      await commitSchoolsRegistry(token, repo, branch, registry, sha, 'feat: provision dedicated worker for ' + slug);
      await markProvisioningPending(db, schoolId, slug, domain);
      return {
        ok: true,
        status: 'started',
        slug,
        domain,
        message: 'Dedicated worker provisioning शुरू हो गया। ' + domain + ' पर deploy कुछ मिनटों में उपलब्ध होगा।',
      };
    } catch (e: any) {
      lastError = String((e && e.message) || e);
      if (!/409|conflict/i.test(lastError)) break;
    }
  }

  await markProvisioningFailed(db, schoolId, lastError || 'schools.json commit विफल।');
  return { ok: false, status: 'error', error: lastError || 'schools.json commit विफल।' };
}

export async function deprovisionDedicatedWorker(
  env: any,
  db: any,
  schoolId: string,
  slug?: string,
): Promise<ProvisioningResult> {
  if (!schoolId) return { ok: false, status: 'error', error: 'schoolId उपलब्ध नहीं है।' };

  const token = String((env && env.GITHUB_TOKEN) || '').trim();
  if (!token) {
    return { ok: false, status: 'error', error: 'GITHUB_TOKEN worker secret सेट नहीं है।' };
  }

  const repo = String((env && env.GITHUB_REPO) || 'NavaSanganakah-Multiventures/school-management').trim();
  const branch = String((env && env.GITHUB_BRANCH) || 'main').trim();

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { registry, sha } = await readSchoolsRegistry(token, repo, branch);
      const schools = Array.isArray(registry.schools) ? registry.schools : [];

      const entry = schools.find((x: any) => x && (x.schoolId === schoolId || (slug && x.slug === slug)));
      if (entry) {
        entry.mode = 'shared';
      }
      registry.schools = schools;

      await commitSchoolsRegistry(token, repo, branch, registry, sha, 'chore: switch ' + (slug || schoolId) + ' to shared mode');
      if (db) {
        await db.prepare('UPDATE school_tenants SET provisioning_status=?, provisioning_error=? WHERE id=?')
          .bind('none', '', schoolId).run();
      }
      return {
        ok: true,
        status: 'started',
        message: 'स्कूल को शेयर्ड वर्कर मोड में सेट कर दिया गया।',
      };
    } catch (e: any) {
      lastError = String((e && e.message) || e);
      if (!/409|conflict/i.test(lastError)) break;
    }
  }

  return { ok: false, status: 'error', error: lastError || 'schools.json commit विफल।' };
}
