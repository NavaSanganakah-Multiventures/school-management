import { Hono } from 'hono';

const configApp = new Hono<{ Bindings: any }>();

configApp.get('/', (c) => {
  const firebaseConfigStr = c.env.FIREBASE_WEB_CONFIG_JSON || '{}';
  let firebaseConfig = {};
  try {
    firebaseConfig = JSON.parse(firebaseConfigStr);
  } catch(e) {
    // skip
  }
  return c.json({ success: true, firebase: firebaseConfig });
});

export default configApp;
