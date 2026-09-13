// Password reset / invite token helpers.
// A token is a 32-byte crypto-random value. Only its SHA-256 hash is stored in D1,
// so a database leak never exposes usable reset links. Tokens are single-use and
// expire after 30 minutes.

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export function generateResetToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bufferToHex(digest);
}

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_TOKEN_RATE_LIMIT_MS = 2 * 60 * 1000;

export interface IssueResetTokenResult {
  token: string;
  limited: boolean;
}

export async function issueResetToken(db: any, userId: string, userType: string, type: string): Promise<IssueResetTokenResult> {
  const now = Date.now();
  const recent = await db.prepare('SELECT id FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId, new Date(now - RESET_TOKEN_RATE_LIMIT_MS).toISOString()).first();
  if (recent) return { token: '', limited: true };

  await db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
    .bind(new Date(now).toISOString(), userId).run();

  const token = generateResetToken();
  const tokenHash = await hashToken(token);
  const id = 'rst-' + now + '-' + crypto.getRandomValues(new Uint32Array(1))[0];
  await db.prepare('INSERT INTO password_reset_tokens (id, user_id, user_type, token_hash, type, expires_at, used_at, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, userId, userType, tokenHash, type, new Date(now + RESET_TOKEN_TTL_MS).toISOString(), null, new Date(now).toISOString()).run();

  return { token, limited: false };
}

export interface ConsumedResetToken {
  userId: string;
  userType: string;
  type: string;
}

export async function consumeResetToken(db: any, token: string): Promise<ConsumedResetToken | null> {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').bind(tokenHash).first();
  if (!row) return null;
  if (row.used_at) return null;
  if (!row.expires_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  await db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  return { userId: row.user_id, userType: row.user_type, type: row.type };
}
