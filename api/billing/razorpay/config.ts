import { Hono } from 'hono';

const razorpayConfigApp = new Hono<{ Bindings: any }>();

// GET /api/billing/razorpay/config
// Returns the Razorpay Key ID at runtime so it isn't baked into the build.
razorpayConfigApp.get('/', (c) => {
  return c.json({ success: true, keyId: (c.env && c.env.RAZORPAY_KEY_ID) || '' });
});

export default razorpayConfigApp;
