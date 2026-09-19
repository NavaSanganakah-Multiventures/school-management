// Email quota / rate limiting helpers.
// Prevents abuse of unauthenticated email flows (e.g. forgot-password) and controls
// daily send volume for the Cloudflare Email (SEND_EMAIL) service binding.

import { loadSubscriptionPlanById } from '../db';

export interface EmailQuotaResult {
  allowed: boolean;
  reason?: string;
}

const GLOBAL_KEY = '__GLOBAL__';

function dayKey(): string {
  return new Date().toISOString().split('T')[0]; // UTC day
}

function limits(env: any) {
  const perRecipient = parseInt(env && env.EMAIL_QUOTA_PER_RECIPIENT_PER_DAY, 10);
  const global = parseInt(env && env.EMAIL_QUOTA_GLOBAL_PER_DAY, 10);
  return {
    perRecipient: Number.isFinite(perRecipient) && perRecipient > 0 ? perRecipient : 3,
    global: Number.isFinite(global) && global > 0 ? global : 200,
  };
}

async function readCount(db: any, day: string, recipient: string): Promise<number> {
  const row = await db.prepare('SELECT count FROM email_quota WHERE day = ? AND recipient = ?')
    .bind(day, recipient).first();
  return row ? Number(row.count) : 0;
}

async function increment(db: any, day: string, recipient: string) {
  const upsertSql = 'INSERT INTO email_quota (id, day, recipient, count, updated_at) '
    + 'VALUES (?, ?, ?, 1, ?) '
    + 'ON CONFLICT(day, recipient) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at';
  await db.prepare(upsertSql).bind(crypto.randomUUID(), day, recipient, new Date().toISOString()).run();
}

export async function checkAndReserveEmailQuota(env: any, recipient: string): Promise<EmailQuotaResult> {
  const db = env && env.DB;
  if (!db || typeof db.prepare !== 'function') {
    // No database available (e.g. local dev): don't block transactional email.
    return { allowed: true };
  }

  const day = dayKey();
  const lim = limits(env);
  const to = String(recipient || '').trim().toLowerCase();

  try {
    const globalCount = await readCount(db, day, GLOBAL_KEY);
    if (globalCount >= lim.global) {
      return { allowed: false, reason: 'दैनिक ईमेल भेजने की वैश्विक सीमा पार हो गई है। कृपया बाद में पुनः प्रयास करें।' };
    }

    if (to) {
      const recipientCount = await readCount(db, day, to);
      if (recipientCount >= lim.perRecipient) {
        return { allowed: false, reason: 'इस ईमेल पते के लिए आज की भेजने की सीमा पार हो गई है। कृपया कल पुनः प्रयास करें।' };
      }
    }

    await increment(db, day, GLOBAL_KEY);
    if (to) {
      await increment(db, day, to);
    }

    return { allowed: true };
  } catch (e: any) {
    // A quota counter failure should not take down transactional email; log for observability.
    console.error('email quota check failed:', e && e.message);
    return { allowed: true };
  }
}


export interface SchoolEmailQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string;
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // UTC YYYY-MM
}

export async function getSchoolEmailQuota(db: any, schoolId: string): Promise<SchoolEmailQuota> {
  const fallback: SchoolEmailQuota = { limit: null, used: 0, remaining: null, resetAt: monthKey() };
  if (!db || typeof db.prepare !== 'function' || !schoolId) return fallback;

  try {
    const sub = await db.prepare(
      'SELECT plan_id, email_quota_limit, email_quota_used, email_quota_reset_at FROM school_subscriptions WHERE school_id = ?'
    ).bind(schoolId).first();

    const currentMonth = monthKey();
    let used = sub && sub.email_quota_used !== undefined && sub.email_quota_used !== null ? Number(sub.email_quota_used) : 0;
    let resetAt = sub && sub.email_quota_reset_at ? String(sub.email_quota_reset_at) : currentMonth;

    if (String(resetAt).slice(0, 7) !== currentMonth) {
      used = 0;
      resetAt = currentMonth;
      await db.prepare('UPDATE school_subscriptions SET email_quota_used = 0, email_quota_reset_at = ? WHERE school_id = ?')
        .bind(currentMonth, schoolId).run();
    }

    let limit: number | null = null;
    if (sub && sub.email_quota_limit !== undefined && sub.email_quota_limit !== null && sub.email_quota_limit !== '') {
      limit = Number(sub.email_quota_limit);
      if (!Number.isFinite(limit) || limit < 0) limit = null;
    } else {
      const plan = await loadSubscriptionPlanById(db, sub && sub.plan_id);
      if (plan && plan.emailQuotaLimit !== undefined && plan.emailQuotaLimit !== null) {
        const n = Number(plan.emailQuotaLimit);
        if (Number.isFinite(n) && n >= 0) limit = n;
      }
    }

    const remaining = limit === null ? null : Math.max(0, limit - used);
    return { limit: limit, used: used, remaining: remaining, resetAt: resetAt };
  } catch (e: any) {
    console.error('school email quota read failed:', e && e.message);
    return fallback;
  }
}

export async function checkAndReserveSchoolEmailQuota(db: any, schoolId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!db || typeof db.prepare !== 'function' || !schoolId) return { allowed: true };

  const quota = await getSchoolEmailQuota(db, schoolId);
  if (quota.limit !== null && quota.used >= quota.limit) {
    return { allowed: false, reason: 'इस माह की ईमेल सीमा पूरी हो गई है। प्लान अपग्रेड करें या अगले माह पुनः प्रयास करें।' };
  }

  try {
    const currentMonth = monthKey();
    await db.prepare(
      'UPDATE school_subscriptions SET email_quota_used = email_quota_used + 1, email_quota_reset_at = ? WHERE school_id = ?'
    ).bind(currentMonth, schoolId).run();
  } catch (e: any) {
    console.error('school email quota increment failed:', e && e.message);
  }
  return { allowed: true };
}
