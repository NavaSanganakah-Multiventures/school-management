// Email quota / rate limiting helpers.
// Prevents abuse of unauthenticated email flows (e.g. forgot-password) and controls
// daily send volume for the Cloudflare Email (SEND_EMAIL) service binding.

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
