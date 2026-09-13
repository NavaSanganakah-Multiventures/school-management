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

// Committed fallback (public values) so web push works even without the CI secret.
const FALLBACK_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIzaSyAsiOpqfdmFzUruBcHUWR7fLpSEtz6Jadk',
  authDomain: 'pragnya-mitra.firebaseapp.com',
  projectId: 'pragnya-mitra',
  storageBucket: 'pragnya-mitra.firebasestorage.app',
  messagingSenderId: '450359194910',
  appId: '1:450359194910:web:4591b664360baa89d0c50f',
  vapidKey: 'BJlcKjZBfC5YzmoIxZ1ndHRJAiemr7Rdi4LBuceK6GI7N6g9aV3ctHpKCtZ8RbaPugnfvfJQNBiRTi63CGipHP4',
};

function parseConfig(): FirebaseWebConfig {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_WEB_CONFIG_JSON;
  if (!raw) return FALLBACK_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return Object.assign({}, FALLBACK_CONFIG, parsed as FirebaseWebConfig);
    }
  } catch (e) { /* ignore */ }
  return FALLBACK_CONFIG;
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
