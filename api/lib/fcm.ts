// Firebase Cloud Messaging (HTTP v1) client for Cloudflare Workers.
// Uses a Google service account (FCM_SERVICE_ACCOUNT_JSON secret) to mint an OAuth2
// access token, then sends messages via the FCM HTTP v1 API.
// No Node-only Firebase Admin SDK is required: all crypto uses the WebCrypto API
// available in Workers (RS256 + SHA-256).

export interface FcmNotification {
  title: string;
  body: string;
}

export interface FcmMessage {
  token?: string;
  topic?: string;
  notification?: FcmNotification;
  data?: Record<string, string>;
  android?: Record<string, any>;
  webpush?: Record<string, any>;
  apns?: Record<string, any>;
}

export interface FcmSendResult {
  success: boolean;
  name?: string;
  messageId?: string;
  error?: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_SEND_URL_BASE = 'https://fcm.googleapis.com/v1/projects';
const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
}

function parseServiceAccount(raw: string): ServiceAccount {
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON secret कॉन्फ़िगर नहीं है।');
  let sa: any;
  try {
    sa = JSON.parse(raw);
  } catch (e) {
    const trimmed = (raw || '').trim();
    const first = trimmed.slice(0, 1);
    let hint = ' (JSON length=' + raw.length + ', पहला अक्षर=' + JSON.stringify(first) + ')।';
    if (first === "'" || first.charCodeAt(0) === 34) {
      hint = hint + ' संभवतः आगे/पीछे quotes लगे हैं — GitHub Secret में सिर्फ raw JSON रखें (बिना quotes/prefix के)।';
    } else if (trimmed.indexOf('FCM_SERVICE_ACCOUNT_JSON=') === 0) {
      hint = hint + ' मान में prefix है — हटा दें, सिर्फ raw JSON रखें।';
    }
    throw new Error('FCM_SERVICE_ACCOUNT_JSON अमान्य JSON है।' + hint);
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('FCM service account में client_email / private_key आवश्यक हैं।');
  }
  return sa as ServiceAccount;
}

export function getFcmProjectId(env: any): string {
  if (env && env.FCM_PROJECT_ID) return String(env.FCM_PROJECT_ID);
  if (env && env.FCM_SERVICE_ACCOUNT_JSON) {
    try {
      const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
      if (sa && sa.project_id) return String(sa.project_id);
    } catch (e) { /* ignore */ }
  }
  return '';
}

export function isFcmConfigured(env: any): boolean {
  return !!(env && env.FCM_SERVICE_ACCOUNT_JSON && getFcmProjectId(env));
}

async function signServiceAccountJwt(sa: ServiceAccount, aud: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: aud,
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = bytesToBase64Url(textEncoder.encode(JSON.stringify(header)));
  const claimsB64 = bytesToBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const signingInput = headerB64 + '.' + claimsB64;

  const keyData = pemToArrayBuffer(sa.private_key);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, textEncoder.encode(signingInput));
  return signingInput + '.' + bytesToBase64Url(new Uint8Array(signature));
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedAccessToken: CachedToken | null = null;

async function getAccessToken(env: any): Promise<string> {
  const raw = env && env.FCM_SERVICE_ACCOUNT_JSON;
  const sa = parseServiceAccount(raw);
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
    return cachedAccessToken.value;
  }
  const tokenUri = sa.token_uri || TOKEN_URL;
  const assertion = await signServiceAccountJwt(sa, tokenUri);
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion,
    }).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error('FCM OAuth token प्राप्त नहीं हुआ: ' + (data.error_description || data.error || ('HTTP ' + res.status)));
  }
  cachedAccessToken = { value: data.access_token, expiresAt: Date.now() + ((data.expires_in || 3600) * 1000) };
  return data.access_token;
}

function platformFields(priority: string): Record<string, any> {
  return {
    android: {
      priority: priority === 'normal' ? 'NORMAL' : 'HIGH',
      notification: { sound: 'default', channel_id: 'vidyasetu_alerts' },
    },
    webpush: {
      headers: { TTL: '86400' },
    },
    apns: {
      payload: { aps: { sound: 'default' } },
    },
  };
}

function normalizeData(data: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(data || {});
  for (let i = 0; i < keys.length; i++) {
    const v = data[keys[i]];
    out[keys[i]] = v === undefined || v === null ? '' : String(v);
  }
  return out;
}

export function buildTopicMessage(topic: string, title: string, body: string, data: Record<string, any>, priority: string): FcmMessage {
  const message: FcmMessage = {
    topic: topic,
    notification: { title: title, body: body },
  };
  const pf = platformFields(priority);
  message.android = pf.android;
  message.webpush = pf.webpush;
  message.apns = pf.apns;
  if (data && Object.keys(data).length) message.data = normalizeData(data);
  return message;
}

export function buildTokenMessage(token: string, title: string, body: string, data: Record<string, any>, priority: string): FcmMessage {
  const message: FcmMessage = {
    token: token,
    notification: { title: title, body: body },
  };
  const pf = platformFields(priority);
  message.android = pf.android;
  message.webpush = pf.webpush;
  message.apns = pf.apns;
  if (data && Object.keys(data).length) message.data = normalizeData(data);
  return message;
}

export async function sendFcmMessage(env: any, message: FcmMessage): Promise<FcmSendResult> {
  const projectId = getFcmProjectId(env);
  if (!projectId) throw new Error('FCM_PROJECT_ID कॉन्फ़िगर नहीं है।');
  const accessToken = await getAccessToken(env);
  const res = await fetch(FCM_SEND_URL_BASE + '/' + projectId + '/messages:send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({ message: message }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: (data && data.error && JSON.stringify(data.error)) || ('HTTP ' + res.status) };
  }
  const name = data && data.name ? String(data.name) : '';
  return { success: true, name: name, messageId: name.split('/').pop() || name };
}
