// api/lib/tenant-crypto.ts
// Domain-separated encryption helpers for secure machine-to-machine tenant data plane synchronization.

const SYNC_SALT = new TextEncoder().encode('vidyasetu-tenant-sync-v1-salt');

export async function deriveSyncKey(secretStr: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretStr),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SYNC_SALT,
      iterations: 10000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPayload(key: CryptoKey, data: any): Promise<string> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < combined.length; i += chunkSize) {
    binary += String.fromCharCode(...Array.from(combined.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export async function decryptPayload(key: CryptoKey, base64Str: string): Promise<any> {
  const dec = new TextDecoder();
  const bin = atob(base64Str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return JSON.parse(dec.decode(plaintext));
}
