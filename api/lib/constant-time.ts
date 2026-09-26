// api/lib/constant-time.ts
// Constant-time string comparison for shared secrets.
//
// Plain `a === b` on a secret leaks length and the position of the first
// differing byte through timing. For high-value shared tokens (bootstrap
// tokens, internal secrets, webhook secrets) the comparison should not be
// observable, so route them through here.
//
// Implementation note: WebCrypto has no "constant-time compare two arbitrary
// strings" primitive, so we compare SHA-256 digests of the two inputs. A digest
// is always exactly 32 bytes, so the length of the compared values no longer
// varies with the secret length, and `crypto.subtle.verify` performs the
// comparison without an early-exit branch.

const encoder = new TextEncoder();

async function digestHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export async function constantTimeEqual(a: any, b: any): Promise<boolean> {
  const left = typeof a === 'string' ? a : '';
  const right = typeof b === 'string' ? b : '';
  // Reject empty values early: an unset secret must never equal an unset header.
  if (!left || !right) return false;
  const [leftHex, rightHex] = await Promise.all([digestHex(left), digestHex(right)]);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode('constant-time-compare-v1'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rightHex));
  return await crypto.subtle.verify('HMAC', key, sig, encoder.encode(leftHex));
}
