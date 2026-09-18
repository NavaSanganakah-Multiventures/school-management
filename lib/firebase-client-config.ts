
export type FirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
};

// Remove build time dependency completely
let cachedConfig: FirebaseWebConfig | null = null;
let fetchPromise: Promise<FirebaseWebConfig> | null = null;

export async function getFirebaseConfig(): Promise<FirebaseWebConfig> {
  if (cachedConfig) return cachedConfig;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/config')
    .then(res => res.json())
    .then(data => {
      cachedConfig = data.firebase || {};
      return cachedConfig as FirebaseWebConfig;
    })
    .catch(() => {
      cachedConfig = {};
      return cachedConfig;
    });

  return fetchPromise;
}
