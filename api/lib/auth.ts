// Real authentication helpers: password hashing (PBKDF2), signed sessions (HMAC).
// No demo data. All secrets come from env (AUTH_SECRET set via GitHub/Cloudflare Secrets).

export type PlatformRole = 'SuperAdmin' | 'Director' | 'Principal' | 'Staff';

export interface AuthPayload {
  sub: string;
  role: PlatformRole;
  schoolId: string;
  exp: number;
}

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: any) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
}

function base64UrlToBytes(str: any) {
  const b64 = str.split('-').join('+').split('_').join('/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function hashPassword(password: any) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hashBytes = new Uint8Array(bits);
  return 'pbkdf2_sha256$100000$' + bytesToBase64Url(salt) + '$' + bytesToBase64Url(hashBytes);
}

export async function verifyPassword(password: any, stored: any) {
  try {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = parseInt(parts[1], 10);
    const salt = base64UrlToBytes(parts[2]);
    const expected = parts[3];
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
    const actual = bytesToBase64Url(new Uint8Array(bits));
    return actual === expected;
  } catch (e) {
    return false;
  }
}

function getSecret(c: any) {
  return (c && c.env && c.env.AUTH_SECRET) || 'vidyasetu-dev-secret-change-me';
}

export async function signToken(c: any, payload: any) {
  const headerStr = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadStr = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = headerStr + '.' + payloadStr;
  const key = await crypto.subtle.importKey('raw', encoder.encode(getSecret(c)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return signingInput + '.' + bytesToBase64Url(new Uint8Array(sig));
}

export async function verifyToken(c: any, token: any) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const key = await crypto.subtle.importKey('raw', encoder.encode(getSecret(c)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(parts[2]), encoder.encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export async function getAuthUser(c: any) {
  const auth = c.req.header('Authorization') || '';
  if (auth.indexOf('Bearer ') !== 0) return null;
  return verifyToken(c, auth.slice(7));
}

export function getRequestSchoolId(c: any, authUser: any) {
  const headerSchool = c.req.header('X-School-Id');
  if (headerSchool) return headerSchool;
  if (authUser && authUser.schoolId) return authUser.schoolId;
  return 'school-01';
}