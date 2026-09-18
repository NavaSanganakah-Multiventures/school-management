import { Hono } from 'hono';

const lmsApp = new Hono<{ Bindings: any }>();

lmsApp.get('/dashboard', (c) => {
  return c.json({ success: true, message: 'LMS active' });
});

export default lmsApp;
