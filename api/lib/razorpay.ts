// Razorpay payment gateway helpers (real API only, no demo/simulated data).

/**
 * Sanitizes a phone number for Razorpay's contact field.
 * Razorpay requires 8-14 digits (no +, spaces, dashes, or country code prefix beyond the digits).
 * Strips all non-digits, removes leading country code if it makes the number too long,
 * and returns null if the result doesn't meet the 8-14 digit requirement.
 */
export function sanitizeRazorpayContact(phone: any): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  // If 15+ digits, strip leading 91 (India country code) or other prefixes
  if (digits.length > 14) {
    if (digits.startsWith('91') && digits.length - 2 <= 14) {
      digits = digits.slice(2);
    } else if (digits.length > 14) {
      digits = digits.slice(-14);
    }
  }
  if (digits.length < 8) return null;
  return digits;
}

function hexFromBytes(bytes: any) {
  return Array.from(bytes).map(function (b: any) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Razorpay keys resolve from env secrets first, then fall back to CONFIG_KV
// (so keys can be stored in KV instead of plaintext worker secrets).

export async function getRazorpayKeyId(env: any): Promise<string> {
  if (env && env.RAZORPAY_KEY_ID) return String(env.RAZORPAY_KEY_ID).trim();
  if (env && env.CONFIG_KV) {
    try { return String((await env.CONFIG_KV.get('RAZORPAY_KEY_ID')) || '').trim(); } catch (_) {}
  }
  return '';
}

export async function getRazorpayKeySecret(env: any): Promise<string> {
  if (env && env.RAZORPAY_KEY_SECRET) return String(env.RAZORPAY_KEY_SECRET).trim();
  if (env && env.CONFIG_KV) {
    try { return String((await env.CONFIG_KV.get('RAZORPAY_KEY_SECRET')) || '').trim(); } catch (_) {}
  }
  return '';
}

export async function getRazorpayWebhookSecret(env: any): Promise<string> {
  if (env && env.RAZORPAY_WEBHOOK_SECRET) return String(env.RAZORPAY_WEBHOOK_SECRET).trim();
  if (env && env.CONFIG_KV) {
    try { return String((await env.CONFIG_KV.get('RAZORPAY_WEBHOOK_SECRET')) || '').trim(); } catch (_) {}
  }
  return '';
}

export async function createRazorpayOrder(c: any, amountINR: any, receipt: any) {
  const keyId = await getRazorpayKeyId(c.env);
  const keySecret = await getRazorpayKeySecret(c.env);
  if (!keyId || !keySecret) {
    return { error: 'Razorpay कुंजियाँ कॉन्फ़िगर नहीं हैं। RAZORPAY_KEY_ID और RAZORPAY_KEY_SECRET (env या CONFIG_KV में) सेट करें।' };
  }
  const amountPaise = Math.round(amountINR * 100);
  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(keyId + ':' + keySecret),
      },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: receipt, notes: { source: 'vidyasetu' } }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: (data && data.error && data.error.description) || 'Razorpay ऑर्डर बनाने में त्रुटि हुई।' };
    }
    return { id: data.id, amount: data.amount, currency: data.currency };
  } catch (e: any) {
    return { error: (e && e.message) ? e.message : 'Razorpay नेटवर्क त्रुटि' };
  }
}

// ==========================================
// Razorpay Subscriptions API (recurring billing + mandates)
// ==========================================

async function getRazorpayAuth(env: any): Promise<{ keyId: string; keySecret: string; authHeader: string } | null> {
  const keyId = await getRazorpayKeyId(env);
  const keySecret = await getRazorpayKeySecret(env);
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, authHeader: 'Basic ' + btoa(keyId + ':' + keySecret) };
}

async function razorpayFetch(env: any, path: string): Promise<any> {
  const auth = await getRazorpayAuth(env);
  if (!auth) return { error: 'Razorpay कुंजियाँ कॉन्फ़िगर नहीं हैं।' };
  try {
    const res = await fetch('https://api.razorpay.com/v1/' + path, {
      headers: { 'Content-Type': 'application/json', Authorization: auth.authHeader },
    });
    const data = await res.json();
    if (!res.ok) return { error: (data && data.error && data.error.description) || 'Razorpay API त्रुटि' };
    return data;
  } catch (e: any) {
    return { error: (e && e.message) ? e.message : 'Razorpay नेटवर्क त्रुटि' };
  }
}

async function razorpayPost(env: any, path: string, body: any): Promise<any> {
  const auth = await getRazorpayAuth(env);
  if (!auth) return { error: 'Razorpay कुंजियाँ कॉन्फ़िगर नहीं हैं।' };
  try {
    const res = await fetch('https://api.razorpay.com/v1/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth.authHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { error: (data && data.error && data.error.description) || 'Razorpay API त्रुटि' };
    return data;
  } catch (e: any) {
    return { error: (e && e.message) ? e.message : 'Razorpay नेटवर्क त्रुटि' };
  }
}

// Create a Razorpay Plan (recurring pricing template: period + amount + interval)
export async function createRazorpayPlan(env: any, input: {
  period: 'monthly' | 'yearly' | 'weekly' | 'daily';
  interval: number;
  amountINR: number;
  name: string;
  description?: string;
  notes?: Record<string, string>;
}): Promise<{ error?: string; id?: string; itemId?: string; period?: string; amount?: number }> {
  const amountPaise = Math.round(input.amountINR * 100);
  const data = await razorpayPost(env, 'plans', {
    period: input.period,
    interval: input.interval,
    item: {
      name: input.name,
      amount: amountPaise,
      currency: 'INR',
      description: input.description || input.name,
    },
    notes: Object.assign({ source: 'vidyasetu' }, input.notes || {}),
  });
  if (data.error) return { error: data.error };
  return { id: data.id, itemId: (data.item && data.item.id) || data.item_id || '', period: input.period, amount: amountPaise };
}

// Fetch a Razorpay Plan by ID
export async function fetchRazorpayPlan(env: any, planId: string): Promise<any> {
  return razorpayFetch(env, 'plans/' + planId);
}

// Create a Razorpay Subscription from a plan
export async function createRazorpaySubscription(env: any, input: {
  planId: string;
  totalCycles: number;
  quantity?: number;
  customerId?: string;
  notes?: Record<string, string>;
  startAt?: number;
}): Promise<{ error?: string; id?: string; status?: string; shortUrl?: string; paymentLinkUrl?: string }> {
  const body: any = {
    plan_id: input.planId,
    total_count: input.totalCycles,
    quantity: input.quantity || 1,
    customer_notify: 1,
    notes: Object.assign({ source: 'vidyasetu' }, input.notes || {}),
  };
  if (input.customerId) {
    body.customer_id = input.customerId;
  }
  if (input.startAt) body.start_at = input.startAt;
  const data = await razorpayPost(env, 'subscriptions', body);
  if (data.error) return { error: data.error };
  return { id: data.id, status: data.status, shortUrl: data.short_url, paymentLinkUrl: data.short_url };
}

// Fetch subscription details (includes mandate info)
export async function fetchRazorpaySubscription(env: any, subscriptionId: string): Promise<any> {
  return razorpayFetch(env, 'subscriptions/' + subscriptionId);
}

// Cancel a subscription
export async function cancelRazorpaySubscription(env: any, subscriptionId: string, cancelAtCycle: boolean = false): Promise<any> {
  const auth = await getRazorpayAuth(env);
  if (!auth) return { error: 'Razorpay कुंजियाँ कॉन्फ़िगर नहीं हैं।' };
  try {
    const res = await fetch('https://api.razorpay.com/v1/subscriptions/' + subscriptionId + '/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth.authHeader },
      body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycle }),
    });
    const data = await res.json();
    if (!res.ok) return { error: (data && data.error && data.error.description) || 'Razorpay cancel त्रुटि' };
    return data;
  } catch (e: any) {
    return { error: (e && e.message) ? e.message : 'Razorpay नेटवर्क त्रुटि' };
  }
}

// Pause a subscription
export async function pauseRazorpaySubscription(env: any, subscriptionId: string): Promise<any> {
  return razorpayPost(env, 'subscriptions/' + subscriptionId + '/pause', { pause_at: 'now' });
}

// Resume a paused subscription
export async function resumeRazorpaySubscription(env: any, subscriptionId: string): Promise<any> {
  return razorpayPost(env, 'subscriptions/' + subscriptionId + '/resume', { resume_at: 'now' });
}

// Fetch mandate details
export async function fetchRazorpayMandate(env: any, mandateId: string): Promise<any> {
  return razorpayFetch(env, 'mandates/' + mandateId);
}

// Revoke a mandate (stops auto-debit permanently)
export async function revokeRazorpayMandate(env: any, mandateId: string): Promise<any> {
  const auth = await getRazorpayAuth(env);
  if (!auth) return { error: 'Razorpay कुंजियाँ कॉन्फ़िगर नहीं हैं।' };
  try {
    const res = await fetch('https://api.razorpay.com/v1/mandates/' + mandateId + '/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth.authHeader },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) return { error: (data && data.error && data.error.description) || 'Razorpay mandate revoke त्रुटि' };
    return data;
  } catch (e: any) {
    return { error: (e && e.message) ? e.message : 'Razorpay नेटवर्क त्रुटि' };
  }
}

// Create a Razorpay Customer
export async function createRazorpayCustomer(env: any, input: {
  name: string;
  email?: string;
  contact?: string;
  notes?: Record<string, string>;
}): Promise<{ error?: string; id?: string }> {
  const sanitizedContact = sanitizeRazorpayContact(input.contact);
  const custBody: any = {
    name: input.name,
    email: input.email || '',
    notes: Object.assign({ source: 'vidyasetu' }, input.notes || {}),
  };
  if (sanitizedContact) custBody.contact = sanitizedContact;
  const data = await razorpayPost(env, 'customers', custBody);
  if (data.error) return { error: data.error };
  return { id: data.id };
}

export async function verifyRazorpaySignature(orderId: any, paymentId: any, signature: any, secret: any) {
  try {
    const body = orderId + '|' + paymentId;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    return hexFromBytes(new Uint8Array(sig)) === signature;
  } catch (e) {
    return false;
  }
}

// Constant-time hex string comparison to avoid timing attacks on signatures.
function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verify a Razorpay webhook payload using the webhook secret (separate from key secret).
// Razorpay signs the raw request body with HMAC-SHA256 and sends it in X-Razorpay-Signature.
export async function verifyRazorpayWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    if (!secret || !signature) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    return safeEqualHex(hexFromBytes(new Uint8Array(sig)), String(signature).toLowerCase());
  } catch (e) {
    return false;
  }
}

export interface RazorpayPaymentLinkInput {
  amountINR: number;
  description: string;
  referenceId: string;
  customerName?: string;
  customerEmail?: string;
  customerContact?: string;
  notes?: Record<string, string>;
}

// Create a Razorpay Payment Link (short_url) that can be sent to a school via email/FCM.
// The school clicks the link and pays — no login or in-app checkout required.
export async function createRazorpayPaymentLink(c: any, input: RazorpayPaymentLinkInput): Promise<{ error?: string; id?: string; shortUrl?: string; status?: string; referenceId?: string }> {
  const keyId = await getRazorpayKeyId(c.env || c);
  const keySecret = await getRazorpayKeySecret(c.env || c);
  if (!keyId || !keySecret) {
    return { error: 'Razorpay कुंजियाँ कॉन्फ़िगर नहीं हैं। RAZORPAY_KEY_ID और RAZORPAY_KEY_SECRET (env या CONFIG_KV में) सेट करें।' };
  }
  if (!input.amountINR || input.amountINR <= 0) {
    return { error: 'पेमेंट लिंक के लिए राशि अमान्य है।' };
  }
  const amountPaise = Math.round(input.amountINR * 100);
  const body: any = {
    amount: amountPaise,
    currency: 'INR',
    accept_partial: false,
    reference_id: input.referenceId,
    description: input.description,
    reminder_enable: true,
    notes: Object.assign({ source: 'vidyasetu' }, input.notes || {}),
  };
  const sanitizedContact = sanitizeRazorpayContact(input.customerContact);
  if (input.customerName || input.customerEmail || sanitizedContact) {
    body.customer = {
      name: input.customerName || '',
      email: input.customerEmail || '',
    };
    if (sanitizedContact) {
      body.customer.contact = sanitizedContact;
    }
  }
  // Razorpay can auto-notify the customer by email/SMS; we also send our own branded email.
  body.notify = { sms: !!sanitizedContact, email: !!(input.customerEmail) };
  try {
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(keyId + ':' + keySecret),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: (data && data.error && data.error.description) || 'Razorpay पेमेंट लिंक बनाने में त्रुटि।' };
    }
    return {
      id: data.id,
      shortUrl: data.short_url,
      status: data.status,
      referenceId: input.referenceId,
    };
  } catch (e: any) {
    return { error: (e && e.message) ? e.message : 'Razorpay नेटवर्क त्रुटि' };
  }
}