// api/lib/tenant-sync.ts
// Helper to synchronize tenant data from central platform (pragnya.nasven.com) into
// the dedicated school worker's local D1 database.

import { getDB } from '../db';
import { deriveSyncKey, decryptPayload, getInternalSyncSecret } from './tenant-crypto';

export async function syncTenantFromPlatform(c: any, targetSchoolId?: string): Promise<{ success: boolean; message: string; count?: number }> {
  const env = c && c.env;
  if (!env || (!env.IS_DEDICATED_WORKER && !env.SCHOOL_ID)) {
    return { success: false, message: 'Sync is only applicable for dedicated workers.' };
  }

  const schoolId = targetSchoolId || env.SCHOOL_ID;
  if (!schoolId) {
    return { success: false, message: 'SCHOOL_ID is not configured on this dedicated worker.' };
  }

  const db = getDB(c);
  if (!db) {
    return { success: false, message: 'Local database is not available.' };
  }

  const syncSecret = await getInternalSyncSecret(env);
  if (!syncSecret) {
    return { success: false, message: 'INTERNAL_SYNC_SECRET is not configured for internal sync.' };
  }

  try {
    const platformBase = String((env && (env.PLATFORM_BASE_URL || env.PLATFORM_API_URL)) || 'https://pragnya.nasven.com').replace(/\/+$/, '');
    const platformUrl = platformBase + '/api/internal/tenant-sync/' + encodeURIComponent(schoolId);
    const res = await fetch(platformUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': syncSecret,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('Platform tenant-sync returned status', res.status, errText);

      // Self-healing fallback if platform DB doesn't have it yet:
      // Ensure at least a baseline school_profile exists so the frontend can load
      const existingProfile = await db.prepare('SELECT id FROM school_profile WHERE id = ?').bind(schoolId).first();
      if (!existingProfile && env.SCHOOL_NAME) {
        const now = new Date().toISOString().split('T')[0];
        await db.prepare(
          'INSERT OR IGNORE INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, updated_at) '
          + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          schoolId,
          env.SCHOOL_NAME || 'Pragnya Mitra स्कूल',
          '',
          'CBSE',
          '',
          'admin@' + (env.SCHOOL_SLUG || 'school') + '.pragnya.nasven.com',
          '',
          '',
          'परिसर',
          'शहर',
          'राज्य',
          '000000',
          '2026-2027',
          'स्कूल निदेशक',
          'प्रधानाचार्य',
          now
        ).run();
      }

      return { success: false, message: 'Platform sync failed: ' + res.status };
    }

    const data: any = await res.json();
    if (!data || !data.success) {
      return { success: false, message: data?.message || 'Invalid sync response from platform.' };
    }

    // 1) Sync school_profile
    if (data.profile) {
      const p = data.profile;
      await db.prepare(
        'INSERT OR REPLACE INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, logo_url, updated_at) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        p.id || schoolId,
        p.school_name || env.SCHOOL_NAME || 'Pragnya Mitra स्कूल',
        p.affiliation_number || '',
        p.board_name || 'CBSE',
        p.school_code || '',
        p.email || '',
        p.phone || '',
        p.alternate_phone || '',
        p.address || '',
        p.city || '',
        p.state || '',
        p.pincode || '',
        p.academic_session || '2026-2027',
        p.director_name || '',
        p.principal_name || '',
        p.logo_url || null,
        p.updated_at || new Date().toISOString().split('T')[0]
      ).run();
    }

    // Decrypt user authentication credentials if provided
    let credentialsMap: Record<string, string> = {};
    if (data.encryptedCredentials) {
      try {
        const syncKey = await deriveSyncKey(syncSecret, schoolId);
        credentialsMap = await decryptPayload(syncKey, data.encryptedCredentials);
      } catch (decErr) {
        console.warn('Could not decrypt synchronized credentials:', decErr);
      }
    }

    // 2) Sync system_users (Director, Staff, etc. with decrypted password hashes)
    let syncedUsers = 0;
    if (Array.isArray(data.users) && data.users.length > 0) {
      for (const u of data.users) {
        if (!u || !u.id || !u.email) continue;
        const passwordHash = credentialsMap[u.id] || null;
        await db.prepare(
          'INSERT OR REPLACE INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, last_login, created_at, updated_at, password_hash, school_id) '
          + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          u.id,
          u.username || u.email,
          u.full_name || 'School User',
          String(u.email).toLowerCase(),
          u.phone || '',
          u.role || 'Staff',
          u.designation || '',
          u.department || null,
          u.qualification || null,
          Number(u.salary || 0),
          u.status || 'Active',
          u.last_login || null,
          u.created_at || new Date().toISOString(),
          u.updated_at || new Date().toISOString(),
          passwordHash,
          schoolId
        ).run();
        syncedUsers++;
      }
    }

    // 3) Sync school_tenants (if present in payload)
    // Use ON CONFLICT upsert limited to synced columns so that local provisioning
    // metadata (deleted_at, dedicated_slug/domain, d1_database_id, r2_bucket_name,
    // kv_namespace_id, provisioned_at, provisioning_status/error, trial_reminder_sent_at,
    // trial_expired_sent_at, estimated_*, preferred_plan_id, custom_requirements) is preserved.
    if (data.tenant) {
      const t = data.tenant;
      try {
        await db.prepare(
          'INSERT INTO school_tenants (id, school_name, subdomain, custom_domain, contact_email, contact_phone, status, registration_status, plan_id, trial_ends_at, approved_at, approved_by, created_at) '
          + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
          + 'ON CONFLICT(id) DO UPDATE SET school_name=excluded.school_name, subdomain=excluded.subdomain, custom_domain=excluded.custom_domain, contact_email=excluded.contact_email, contact_phone=excluded.contact_phone, status=excluded.status, registration_status=excluded.registration_status, plan_id=excluded.plan_id, trial_ends_at=excluded.trial_ends_at, approved_at=excluded.approved_at, approved_by=excluded.approved_by'
        ).bind(
          t.id || schoolId,
          t.school_name || env.SCHOOL_NAME || '',
          t.subdomain || env.SCHOOL_SLUG || '',
          t.custom_domain || '',
          t.contact_email || '',
          t.contact_phone || '',
          t.status || 'Active',
          t.registration_status || 'Approved',
          t.plan_id || 'enterprise',
          t.trial_ends_at || null,
          t.approved_at || null,
          t.approved_by || null,
          t.created_at || new Date().toISOString()
        ).run();
      } catch (_) {
        // non-fatal if table not needed in local operational DB
      }
    }

    // 4) Sync school_subscriptions (if present in payload)
    // ON CONFLICT upsert preserves razorpay_order_id/payment_id/signature and email_quota_*
    // columns that would otherwise be wiped by INSERT OR REPLACE.
    if (data.subscription) {
      const s = data.subscription;
      try {
        await db.prepare(
          'INSERT INTO school_subscriptions (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status, auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end, trial_ends_at, updated_at) '
          + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
          + 'ON CONFLICT(id) DO UPDATE SET plan_id=excluded.plan_id, plan_name=excluded.plan_name, billing_cycle=excluded.billing_cycle, price_per_cycle=excluded.price_per_cycle, discount_percent=excluded.discount_percent, status=excluded.status, auto_pay_enabled=excluded.auto_pay_enabled, payment_method=excluded.payment_method, mandate_id=excluded.mandate_id, next_billing_date=excluded.next_billing_date, period_start=excluded.period_start, period_end=excluded.period_end, trial_ends_at=excluded.trial_ends_at, updated_at=excluded.updated_at'
        ).bind(
          s.id || ('sub-' + Date.now()),
          schoolId,
          s.plan_id || 'enterprise',
          s.plan_name || 'Enterprise Dedicated',
          s.billing_cycle || 'annual',
          Number(s.price_per_cycle || 0),
          Number(s.discount_percent || 0),
          s.status || 'Active',
          s.auto_pay_enabled ? 1 : 0,
          s.payment_method || 'Invoice',
          s.mandate_id || '',
          s.next_billing_date || '',
          s.period_start || '',
          s.period_end || '',
          s.trial_ends_at || '',
          s.updated_at || new Date().toISOString()
        ).run();
      } catch (_) {
        // non-fatal
      }
    }

    console.log(`Successfully synced tenant ${schoolId} into dedicated DB with ${syncedUsers} users.`);
    return { success: true, message: 'Tenant data synced successfully.', count: syncedUsers };
  } catch (err: any) {
    console.error('Error during tenant sync:', err);
    return { success: false, message: err?.message || 'Sync exception' };
  }
}
