// Native Web Push client (RFC 8030 + RFC 8291 + RFC 8188) for Cloudflare Workers.
// Sends encrypted push messages directly to browser PushSubscription endpoints using the
// VAPID authentication scheme. No Firebase SDK and no Node-only crypto are required:
// everything is built on the WebCrypto API available in Workers.
//
// Encryption profile: aes128gcm (single record), matching the widely deployed
// "web-push" npm library behaviour for aes128gcm:
//   header = salt(16) || rs(4, BE) || idlen(1) || senderPublicKey(65)
//   body   = header || AES-128-GCM( data || 0x02 )
// Key derivation (RFC 8291):
//   ikm    = ECDH(senderPrivate, receiverPublic)
//   secret = HKDF(auth, ikm, "WebPush: info\0" || receiverPublic || senderPublic, 32)
//   prk    = HMAC-SHA256(salt, secret)
//   cek    = HKDF-Expand(prk, "Content-Encoding: aes128gcm\0", 16)
//   nonce  = HKDF-Expand(prk, "Content-Encoding: nonce\0", 12)

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushSendResult {
  success: boolean;
  status?: number;
  error?: string;
}

const FALLBACK_VAPID_PUBLIC_KEY = 'BJlcKjZBfC5YzmoIxZ1ndHRJAiemr7Rdi4LBuceK6GI7N6g9aV3ctHpKCtZ8RbaPugnfvfJQNBiRTi63CGipHP4';
const FALLBACK_VAPID_SUBJECT = 'mailto:pragnya@navasanganakah.com';
const VAPID_TTL = '86400';

const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  let b64 = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (let i = 0; i < arrays.length; i++) total += arrays[i].length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    out.set(arrays[i], offset);
    offset += arrays[i].length;
  }
  return out;
}

function u32be(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(4);
  out[0] = (n >>> 24) & 0xff;
  out[1] = (n >>> 16) & 0xff;
  out[2] = (n >>> 8) & 0xff;
  out[3] = n & 0xff;
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return hmacSha256(salt, ikm);
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array<ArrayBuffer>> {
  let output = new Uint8Array(0);
  let t = new Uint8Array(0);
  let counter = 0;
  while (output.length < length) {
    counter += 1;
    t = await hmacSha256(prk, concatBytes(t, info, new Uint8Array([counter])));
    output = concatBytes(output, t);
  }
  return output.slice(0, length);
}

function getVapidPublicKey(env: any): string {
  if (env && env.WEB_PUSH_VAPID_PUBLIC_KEY) return String(env.WEB_PUSH_VAPID_PUBLIC_KEY);
  return FALLBACK_VAPID_PUBLIC_KEY;
}

function getVapidSubject(env: any): string {
  if (env && env.WEB_PUSH_VAPID_SUBJECT) return String(env.WEB_PUSH_VAPID_SUBJECT);
  return FALLBACK_VAPID_SUBJECT;
}

export function isWebPushConfigured(env: any): boolean {
  return !!(env && env.WEB_PUSH_VAPID_PRIVATE_KEY);
}

async function createVapidJwt(env: any, origin: string): Promise<string> {
  const publicKey = getVapidPublicKey(env);
  const privateKey = String(env.WEB_PUSH_VAPID_PRIVATE_KEY);
  const subject = getVapidSubject(env);

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const headerB64 = bytesToBase64Url(textEncoder.encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signingInput = headerB64 + '.' + payloadB64;

  const privateBytes = base64UrlToBytes(privateKey);
  const publicBytes = base64UrlToBytes(publicKey);
  if (privateBytes.length !== 32) {
    throw new Error('WEB_PUSH_VAPID_PRIVATE_KEY अमान्य है (32-byte base64url आवश्यक)।');
  }
  if (publicBytes.length !== 65) {
    throw new Error('WEB_PUSH_VAPID_PUBLIC_KEY अमान्य है (65-byte base64url आवश्यक)।');
  }

  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: bytesToBase64Url(privateBytes),
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, textEncoder.encode(signingInput) as BufferSource));
  return signingInput + '.' + bytesToBase64Url(signature);
}

async function encryptPayload(receiverPublicB64Url: string, authB64Url: string, plaintext: string): Promise<Uint8Array<ArrayBuffer>> {
  const receiverPublic = base64UrlToBytes(receiverPublicB64Url);
  const authSecret = base64UrlToBytes(authB64Url);
  if (receiverPublic.length !== 65) throw new Error('subscription.keys.p256dh अमान्य है।');
  if (authSecret.length !== 16) throw new Error('subscription.keys.auth अमान्य है।');

  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const receiverKey = await crypto.subtle.importKey('raw', receiverPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, keyPair.privateKey, 256));

  const secret = await hkdfExpand(
    await hkdfExtract(authSecret, ecdhSecret),
    concatBytes(textEncoder.encode('WebPush: info\0'), receiverPublic, senderPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, secret);
  const cek = await hkdfExpand(prk, textEncoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonceBase = await hkdfExpand(prk, textEncoder.encode('Content-Encoding: nonce\0'), 12);

  const data = textEncoder.encode(plaintext);
  const rs = Math.max(4096, data.length + 18);
  // Single record (last record): plaintext = data || 0x02 (padding delimiter)
  const recordPlaintext = concatBytes(data, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipherRecord = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBase as BufferSource, tagLength: 128 },
    aesKey,
    recordPlaintext as BufferSource,
  ));

  return concatBytes(salt, u32be(rs), new Uint8Array([senderPublic.length]), senderPublic, cipherRecord);
}

export async function sendWebPushNotification(
  env: any,
  subscription: WebPushSubscription,
  payload: any,
): Promise<WebPushSendResult> {
  if (!isWebPushConfigured(env)) {
    return { success: false, error: 'WEB_PUSH_VAPID_PRIVATE_KEY secret कॉन्फ़िगर नहीं है।' };
  }
  if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return { success: false, error: 'PushSubscription अमान्य है।' };
  }

  let endpoint: URL;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch (e) {
    return { success: false, error: 'PushSubscription endpoint अमान्य है।' };
  }
  if (endpoint.protocol !== 'https:') {
    return { success: false, error: 'Push endpoint https नहीं है।' };
  }

  const origin = endpoint.protocol + '//' + endpoint.host;
  const publicKey = getVapidPublicKey(env);
  const jwt = await createVapidJwt(env, origin);
  const body = await encryptPayload(subscription.keys.p256dh, subscription.keys.auth, JSON.stringify(payload));

  let res: Response;
  try {
    res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: VAPID_TTL,
        'Content-Length': String(body.length),
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        Authorization: 'vapid t=' + jwt + ', k=' + publicKey,
        Urgency: 'normal',
      },
      body: body,
    });
  } catch (e: any) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }

  if (res.status === 200 || res.status === 201) {
    return { success: true, status: res.status };
  }
  return { success: false, status: res.status, error: 'HTTP ' + res.status };
}
