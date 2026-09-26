// api/lib/constant-time.ts
// Constant-time string comparison for shared secrets.
//
// Plain `a === b` on a secret leaks length and the position of the first
// differing byte through timing. For high-value shared tokens (bootstrap
// tokens, internal secrets, webhook secrets) the comparison should not be
// observable, so route them through here.
//
// HOW THIS WORKS, AND WHY IT IS SHAPED THIS WAY
//
// Both sides are hashed with SHA-256 first. That normalises the input to a
// fixed 32 bytes, so the comparison loop below always runs the same number of
// iterations no matter how long the secrets are, and the early-return for an
// empty input cannot distinguish "empty" from "short".
//
// The loop then accumulates `left[i] ^ right[i]` into `diff` and only inspects
// `diff` at the very end. There is deliberately no `if (a[i] !== b[i]) return
// false` inside the loop, because that is exactly the branch that leaks.
//
// A NOTE ON WHAT WAS HERE BEFORE
//
// The previous version imported an HMAC key with usages `['verify']` and then
// called `crypto.subtle.sign()` with it. WebCrypto only permits `sign` on a key
// whose usages include `'sign'`, so every call threw `InvalidAccessError`. In
// practice `/api/admin/bootstrap` answered 500 for *any* supplied token,
// including a wrong one, which is how the defect was found: CI could no longer
// sync Super Admin credentials, and the gate never returned its intended 401.
//
// It passed the in-repo harness because
// `scripts/verify-phase0-signing.mjs` carried its own hand-written copy of this
// function built on Node's `crypto.timingSafeEqual`. The harness was testing a
// reimplementation rather than the shipped module, so it could never catch this
// class of bug. The harness now transpiles and imports this exact file.
//
// This function must not throw. Every caller relies on a boolean: a caller that
// gets an exception instead of `false` turns an authentication failure into a
// 500 and loses the ability to distinguish "wrong secret" from "broken code".

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  const out = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return new Uint8Array(out);
}

export async function constantTimeEqual(a: unknown, b: unknown): Promise<boolean> {
  const left = typeof a === 'string' ? a : '';
  const right = typeof b === 'string' ? b : '';
  // An unset secret must never equal an unset header. This is the one
  // length-dependent branch, and it only ever returns false.
  if (!left || !right) return false;

  const [leftDigest, rightDigest] = await Promise.all([digest(left), digest(right)]);

  // Fixed 32-byte digests, so the trip count is independent of secret length.
  let diff = 0;
  for (let i = 0; i < leftDigest.length; i++) {
    diff |= leftDigest[i] ^ rightDigest[i];
  }
  return diff === 0;
}
