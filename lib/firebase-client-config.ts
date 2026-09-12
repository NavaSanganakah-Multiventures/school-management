// Firebase Web App configuration for the website's push notifications.
// These values are injected at BUILD TIME from NEXT_PUBLIC_FIREBASE_WEB_CONFIG_JSON
// (set by the CI workflow from the GitHub Secret FIREBASE_WEB_CONFIG_JSON).
// The values are PUBLIC at runtime (visible in the browser); they are kept out of the
// repository source only for cleanliness / single-source-of-truth. If the secret is
// absent, web push is silently disabled.

type FirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
};

function parseConfig(): FirebaseWebConfig {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_WEB_CONFIG_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as FirebaseWebConfig) : {};
  } catch (e) {
    return {};
  }
}

const CONFIG = parseConfig();

export const FIREBASE_WEB_CONFIG = {
  apiKey: CONFIG.apiKey || '',
  authDomain: CONFIG.authDomain || '',
  projectId: CONFIG.projectId || '',
  storageBucket: CONFIG.storageBucket || '',
  messagingSenderId: CONFIG.messagingSenderId || '',
  appId: CONFIG.appId || '',
};

export const FIREBASE_VAPID_KEY = CONFIG.vapidKey || '';
