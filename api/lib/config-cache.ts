/**
 * Zero-DB-Cost Edge Configuration Provider for Pragnya Mitra
 * 
 * Minimizes Cloudflare D1 query costs by reading frequently-accessed
 * school settings, branding, contact info, session, and feature flags directly
 * from Worker Environment Variables (Level 1) or Edge KV Cache (Level 2).
 * D1 (Level 3) is only queried as an authoritative fallback and writes.
 */

export interface SchoolBrandingConfig {
  schoolId: string;
  schoolName: string;
  contactPhone: string;
  contactEmail: string;
  affiliationNumber: string;
  boardName: string;
  schoolCode: string;
  academicSession: string;
  themeColor?: string;
  logoUrl?: string;
  source: 'worker_env' | 'kv_cache' | 'd1_fallback';
}

/**
 * Reads a config key with multi-tiered zero-DB-cost caching.
 */
export async function getCachedConfig<T = string>(
  c: any,
  key: string,
  fallbackValue: T
): Promise<{ value: T; source: 'worker_env' | 'kv_cache' | 'd1_fallback' }> {
  // Level 1: Worker Environment Variable (0ms, 0 DB cost)
  if (c.env && c.env[key] !== undefined && c.env[key] !== null && c.env[key] !== '') {
    try {
      const parsed = typeof c.env[key] === 'string' && (c.env[key].startsWith('{') || c.env[key].startsWith('['))
        ? JSON.parse(c.env[key])
        : c.env[key];
      return { value: parsed as T, source: 'worker_env' };
    } catch {
      return { value: c.env[key] as T, source: 'worker_env' };
    }
  }

  // Level 2: Cloudflare KV Namespace (Edge key-value, 0 D1 cost)
  if (c.env && c.env.CONFIG_KV) {
    try {
      const kvVal = await c.env.CONFIG_KV.get(key);
      if (kvVal !== null && kvVal !== undefined) {
        try {
          const parsed = JSON.parse(kvVal);
          return { value: parsed as T, source: 'kv_cache' };
        } catch {
          return { value: kvVal as T, source: 'kv_cache' };
        }
      }
    } catch (err) {
      console.warn(`[ConfigCache] KV read warning for ${key}:`, err);
    }
  }

  return { value: fallbackValue, source: 'd1_fallback' };
}

/**
 * Retrieves school profile and branding with Zero-DB-Cost prioritization.
 * Directly reads School Name, School ID, Phone, Email, Session from ENV first.
 */
export async function getCachedSchoolBranding(c: any, schoolId: string = 'school-01'): Promise<SchoolBrandingConfig> {
  const envSchoolId = (c.env && (c.env.SCHOOL_ID || c.env.SCHOOL_SLUG)) || schoolId;
  const envSchoolName = c.env && c.env.SCHOOL_NAME;
  const envContactPhone = c.env && (c.env.CONTACT_PHONE || c.env.SCHOOL_PHONE || c.env.MOBILE_NUMBER);
  const envContactEmail = c.env && (c.env.CONTACT_EMAIL || c.env.SCHOOL_EMAIL);
  const envBoardName = c.env && c.env.BOARD_NAME;
  const envSession = c.env && c.env.ACADEMIC_SESSION;
  const envAffiliation = c.env && c.env.AFFILIATION_NUMBER;
  const envSchoolCode = c.env && c.env.SCHOOL_CODE;
  const envLogoUrl = c.env && c.env.SCHOOL_LOGO_URL;

  // Level 1: Worker Environment Variables (Instant edge read, 0 DB cost)
  if (envSchoolName) {
    return {
      schoolId: envSchoolId,
      schoolName: envSchoolName,
      contactPhone: envContactPhone || '',
      contactEmail: envContactEmail || '',
      affiliationNumber: envAffiliation || '',
      boardName: envBoardName || 'CBSE',
      schoolCode: envSchoolCode || '',
      academicSession: envSession || '2026-2027',
      logoUrl: envLogoUrl || '',
      source: 'worker_env',
    };
  }

  // Level 2: KV Cache
  if (c.env && c.env.CONFIG_KV) {
    try {
      const cached = await c.env.CONFIG_KV.get(`school_branding_${schoolId}`, 'json');
      if (cached) {
        return { ...(cached as SchoolBrandingConfig), source: 'kv_cache' };
      }
    } catch (_) {}
  }

  // Level 3: D1 Database fallback
  if (c.env && c.env.DB) {
    try {
      const row = await c.env.DB.prepare('SELECT * FROM school_profile WHERE id = ?').bind(schoolId).first();
      if (row) {
        const config: SchoolBrandingConfig = {
          schoolId: row.id || schoolId,
          schoolName: row.school_name || 'प्रज्ञा मित्र पब्लिक स्कूल',
          contactPhone: row.phone || '',
          contactEmail: row.email || '',
          affiliationNumber: row.affiliation_number || '',
          boardName: row.board_name || 'CBSE',
          schoolCode: row.school_code || '',
          academicSession: row.academic_session || '2026-2027',
          logoUrl: row.logo_url || '',
          source: 'd1_fallback',
        };

        // Cache into KV for 1 hour so subsequent reads cost 0 DB rows
        if (c.env.CONFIG_KV) {
          c.executionCtx?.waitUntil(
            c.env.CONFIG_KV.put(`school_branding_${schoolId}`, JSON.stringify(config), { expirationTtl: 3600 })
          );
        }

        return config;
      }
    } catch (err) {
      console.warn('[ConfigCache] D1 fallback query failed:', err);
    }
  }

  // Ultimate fallback default
  return {
    schoolId,
    schoolName: '[School Name Not Configured]',
    contactPhone: '',
    contactEmail: '',
    affiliationNumber: '',
    boardName: 'CBSE',
    schoolCode: '',
    academicSession: '2026-2027',
    source: 'd1_fallback',
  };
}

/**
 * Invalidates edge cache when school profile or settings are updated.
 */
export async function invalidateSchoolBrandingCache(c: any, schoolId: string = 'school-01'): Promise<void> {
  if (c.env && c.env.CONFIG_KV) {
    try {
      await c.env.CONFIG_KV.delete(`school_branding_${schoolId}`);
    } catch (err) {
      console.warn('[ConfigCache] KV cache eviction failed:', err);
    }
  }
}
