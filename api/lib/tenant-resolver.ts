import { getDB } from '../db';

export interface HostDetails {
  rawHost: string;
  cleanHost: string;
  subdomain: string | null;
  customDomain: string | null;
  slug: string | null;
  schoolId: string | null;
}

export interface ResolvedTenant {
  schoolId: string;
  schoolName: string;
  subdomain: string;
  customDomain?: string;
  dedicatedDomain?: string;
  dedicatedSlug?: string;
  logoUrl?: string | null;
  boardName?: string;
  affiliationNumber?: string;
  city?: string;
  state?: string;
  academicSession?: string;
  status: string;
  isDedicated: boolean;
  baseDomain: string;
  apiBaseUrl: string;
}

/**
 * Extract domain, subdomain, slug, or explicit schoolId from request headers, URL, or query.
 */
export function extractHostDetails(c: any): HostDetails {
  const baseDomain = String((c.env && (c.env.DISPATCH_BASE_DOMAIN || c.env.BASE_DOMAIN)) || 'pragnya.nasven.com').toLowerCase();

  // Header priority: X-School-Domain > X-Forwarded-Host > Host > URL hostname
  const explicitDomain = c.req.header('X-School-Domain') || c.req.header('x-school-domain') || null;
  const explicitSlug = c.req.header('X-School-Slug') || c.req.header('x-school-slug') || null;
  const querySlug = c.req.query('schoolSlug') || c.req.query('subdomain') || c.req.query('slug') || null;
  const queryDomain = c.req.query('schoolDomain') || c.req.query('domain') || null;
  const querySchoolId = c.req.query('schoolId') || null;

  const headerHost = c.req.header('X-Forwarded-Host') || c.req.header('Host') || '';
  let candidateHost = explicitDomain || queryDomain || headerHost;

  if (!candidateHost) {
    try {
      candidateHost = new URL(c.req.url).hostname;
    } catch (_) {
      candidateHost = baseDomain;
    }
  }

  // Strip port (e.g., localhost:3000 -> localhost)
  const cleanHost = String(candidateHost).trim().toLowerCase().split(':')[0];

  let subdomain: string | null = null;
  let customDomain: string | null = null;

  // Check if candidateHost is a subdomain of baseDomain (e.g. greenwood.pragnya.nasven.com)
  if (cleanHost.endsWith('.' + baseDomain)) {
    const sub = cleanHost.slice(0, -(baseDomain.length + 1)).split('.').pop() || '';
    if (sub && sub !== 'www' && sub !== 'api') {
      subdomain = sub;
    }
  } else if (cleanHost !== baseDomain && cleanHost !== 'localhost' && cleanHost !== '127.0.0.1') {
    // It's a custom domain (e.g. portal.greenwood.edu.in)
    customDomain = cleanHost;
  }

  const slug = explicitSlug || querySlug || subdomain;

  return {
    rawHost: candidateHost,
    cleanHost,
    subdomain,
    customDomain,
    slug,
    schoolId: querySchoolId,
  };
}

/**
 * Resolve tenant metadata from Cloudflare D1 database (school_tenants + school_profile)
 */
export async function resolveTenantFromDB(db: any, host: HostDetails, env?: any): Promise<ResolvedTenant | null> {
  if (!db) return null;

  const baseDomain = String((env && (env.DISPATCH_BASE_DOMAIN || env.BASE_DOMAIN)) || 'pragnya.nasven.com').toLowerCase();

  const searchId = host.schoolId || null;
  const searchSlug = host.slug ? host.slug.toLowerCase() : null;
  const searchDomain = host.customDomain ? host.customDomain.toLowerCase() : (host.cleanHost || null);

  if (!searchId && !searchSlug && !searchDomain) {
    return null;
  }

  const sql =
    'SELECT ' +
    't.id, t.school_name, t.subdomain, t.custom_domain, t.dedicated_domain, t.dedicated_slug, t.status, t.plan_id, ' +
    'p.school_name AS profile_name, p.logo_url, p.board_name, p.affiliation_number, p.city, p.state, p.academic_session ' +
    'FROM school_tenants t ' +
    'LEFT JOIN school_profile p ON p.id = t.id ' +
    'WHERE ( ' +
    '  (? IS NOT NULL AND t.id = ?) OR ' +
    '  (? IS NOT NULL AND LOWER(t.subdomain) = ?) OR ' +
    '  (? IS NOT NULL AND LOWER(t.dedicated_slug) = ?) OR ' +
    '  (? IS NOT NULL AND LOWER(t.custom_domain) = ?) OR ' +
    '  (? IS NOT NULL AND LOWER(t.dedicated_domain) = ?) ' +
    ') AND t.deleted_at IS NULL ' +
    'LIMIT 1';

  try {
    const row: any = await db.prepare(sql).bind(
      searchId, searchId,
      searchSlug, searchSlug,
      searchSlug, searchSlug,
      searchDomain, searchDomain,
      searchDomain, searchDomain
    ).first();

    if (!row) return null;

    const matchedSub = row.subdomain || row.dedicated_slug || '';
    const apiBaseUrl = row.dedicated_domain
      ? `https://${row.dedicated_domain}`
      : (matchedSub ? `https://${matchedSub}.${baseDomain}` : `https://${baseDomain}`);

    return {
      schoolId: row.id,
      schoolName: row.profile_name || row.school_name || 'विद्या सेतु स्कूल',
      subdomain: matchedSub,
      customDomain: row.custom_domain || undefined,
      dedicatedDomain: row.dedicated_domain || undefined,
      dedicatedSlug: row.dedicated_slug || undefined,
      logoUrl: row.logo_url || null,
      boardName: row.board_name || 'CBSE',
      affiliationNumber: row.affiliation_number || '',
      city: row.city || '',
      state: row.state || '',
      academicSession: row.academic_session || '2026-2027',
      status: row.status || 'Active',
      isDedicated: !!row.dedicated_domain || !!row.dedicated_slug,
      baseDomain,
      apiBaseUrl,
    };
  } catch (err) {
    console.warn('[TenantResolver] DB lookup error:', err);
    return null;
  }
}

/**
 * Main tenant resolution entry point.
 * 1. Honors Dedicated Worker environment bindings (env.SCHOOL_ID, env.SCHOOL_NAME)
 * 2. On Shared Worker, inspects request headers and checks D1 database
 * 3. Falls back safely to default tenant
 */
export async function resolveTenant(c: any): Promise<ResolvedTenant> {
  const env = c && c.env;
  const isDedicated = !!(env && (env.IS_DEDICATED_WORKER === 'true' || env.SCHOOL_ID));
  const baseDomain = String((env && (env.DISPATCH_BASE_DOMAIN || env.BASE_DOMAIN)) || 'pragnya.nasven.com').toLowerCase();

  if (isDedicated && env.SCHOOL_ID) {
    const slug = env.SCHOOL_SLUG || '';
    return {
      schoolId: env.SCHOOL_ID,
      schoolName: env.SCHOOL_NAME || 'विद्या सेतु स्कूल',
      subdomain: slug,
      dedicatedSlug: slug,
      dedicatedDomain: env.DEDICATED_DOMAIN || (slug ? `${slug}.${baseDomain}` : undefined),
      logoUrl: null,
      status: 'Active',
      isDedicated: true,
      baseDomain,
      apiBaseUrl: env.APP_BASE_URL || (slug ? `https://${slug}.${baseDomain}` : `https://${baseDomain}`),
    };
  }

  const db = getDB(c);
  const hostDetails = extractHostDetails(c);

  if (db) {
    const matched = await resolveTenantFromDB(db, hostDetails, env);
    if (matched) {
      return matched;
    }

    // Default tenant fallback for shared worker (e.g. school-01)
    const defaultSchoolId = (env && env.DEFAULT_SCHOOL_ID) || 'school-01';
    const defaultRow = await resolveTenantFromDB(db, { ...hostDetails, schoolId: defaultSchoolId }, env);
    if (defaultRow) {
      return defaultRow;
    }
  }

  // Absolute fallback
  return {
    schoolId: (env && env.DEFAULT_SCHOOL_ID) || 'school-01',
    schoolName: (env && env.DEFAULT_SCHOOL_NAME) || 'विद्या सेतु स्कूल (VidyaSetu)',
    subdomain: '',
    status: 'Active',
    isDedicated: false,
    baseDomain,
    apiBaseUrl: `https://${baseDomain}`,
  };
}
