// Firebase Web App configuration for the website's push notifications.
// These values are fetched at RUNTIME from /api/config.
// The values are PUBLIC at runtime (visible in the browser). If the config is
// absent, web push is silently disabled.

export type FirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
};

// Committed fallback (public values) so web push works even without runtime config
const FALLBACK_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIzaSyAsiOpqfdmFzUruBcHUWR7fLpSEtz6Jadk',
  authDomain: 'pragnya-mitra.firebaseapp.com',
  projectId: 'pragnya-mitra',
  storageBucket: 'pragnya-mitra.firebasestorage.app',
  messagingSenderId: '450359194910',
  appId: '1:450359194910:web:4591b664360baa89d0c50f',
  vapidKey: 'BJlcKjZBfC5YzmoIxZ1ndHRJAiemr7Rdi4LBuceK6GI7N6g9aV3ctHpKCtZ8RbaPugnfvfJQNBiRTi63CGipHP4',
};

let cachedConfig: FirebaseWebConfig | null = null;

export async function fetchFirebaseConfig(): Promise<FirebaseWebConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to fetch config');
    const data = await res.json();
    if (data && data.firebaseWebConfig) {
      const parsed = JSON.parse(data.firebaseWebConfig);
      cachedConfig = Object.assign({}, FALLBACK_CONFIG, parsed);
      return cachedConfig as FirebaseWebConfig;
    }
  } catch (e) {
    // silently fallback
  }
  cachedConfig = FALLBACK_CONFIG;
  return cachedConfig;
}

// Keeping synchronous fallbacks exported for backward compatibility
// with components that haven't been migrated to async initialization yet.
export const FIREBASE_WEB_CONFIG = {
  apiKey: FALLBACK_CONFIG.apiKey || '',
  authDomain: FALLBACK_CONFIG.authDomain || '',
  projectId: FALLBACK_CONFIG.projectId || '',
  storageBucket: FALLBACK_CONFIG.storageBucket || '',
  messagingSenderId: FALLBACK_CONFIG.messagingSenderId || '',
  appId: FALLBACK_CONFIG.appId || '',
};

export const FIREBASE_VAPID_KEY = FALLBACK_CONFIG.vapidKey || '';
