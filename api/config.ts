import { Hono } from 'hono';

const configApp = new Hono<{ Bindings: any }>();

configApp.get('/', (c) => {
  return c.json({
    firebaseWebConfig: c.env.FIREBASE_WEB_CONFIG_JSON || null,
  });
});

export default configApp;
