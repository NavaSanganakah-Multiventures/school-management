// Razorpay payment gateway helpers (real API only, no demo/simulated data).

function hexFromBytes(bytes: any) {
  return Array.from(bytes).map(function (b: any) { return b.toString(16).padStart(2, '0'); }).join('');
}

export async function createRazorpayOrder(c: any, amountINR: any, receipt: any) {
  const keyId = (c.env && c.env.RAZORPAY_KEY_ID) || '';
  const keySecret = (c.env && c.env.RAZORPAY_KEY_SECRET) || '';
  if (!keyId || !keySecret) {
    return { error: 'Razorpay कुंजियाँ कॉन्फ़िगर नहीं हैं। GitHub Secrets में RAZORPAY_KEY_ID और RAZORPAY_KEY_SECRET सेट करें।' };
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