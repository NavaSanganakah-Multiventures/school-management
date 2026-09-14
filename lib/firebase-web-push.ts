'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging as getMessagingSDK, getToken, onMessage, isSupported } from 'firebase/messaging';
import { FIREBASE_VAPID_KEY, FIREBASE_WEB_CONFIG } from './firebase-client-config';

const SW_PATH = '/firebase-messaging-sw.js';
// Max wait time for the service worker to become active before falling back.
const SW_ACTIVATE_TIMEOUT_MS = 8000;

let cachedSwRegistration: ServiceWorkerRegistration | null = null;
let messagingInstance: any = null;

export type WebPushDiagnostic = {
  supported: boolean;
  configOk: boolean;
  configProjectId: string;
  permission: string;
  swRegistered: boolean;
  swActive: boolean;
  token: string | null;
  error: string | null;
  networkProbe: { gstatic: boolean; installations: boolean; fcmRegistrations: boolean } | null;
};

let lastWebPushDiagnostic: WebPushDiagnostic | null = null;

export function getWebPushDiagnostic(): WebPushDiagnostic | null {
  return lastWebPushDiagnostic;
}

function errMsg(e: any): string {
  if (!e) return 'unknown';
  let s = '';
  if (e.code) s += 'code=' + e.code + ' ';
  if (e.name) s += e.name + ': ';
  s += (e.message != null) ? e.message : String(e);
  return s;
}

async function probeReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch (e) {
    return false;
  }
}

async function probeCorsReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' });
    return res.ok || res.type !== 'opaque';
  } catch (e) {
    return false;
  }
}

async function getMessaging(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('browser only');
  
  // Check if messaging is supported
  const supported = await isSupported();
  if (!supported) throw new Error('Firebase messaging not supported in this browser');
  
  if (messagingInstance) return messagingInstance;
  
  try {
    // Initialize Firebase app if not already initialized
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_WEB_CONFIG);
    
    // Get messaging instance
    messagingInstance = getMessagingSDK(app);
    return messagingInstance;
  } catch (e) {
    console.error('Firebase messaging initialization failed:', e);
    throw e;
  }
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(function (resolve) { setTimeout(function () { resolve(fallback); }, ms); }),
  ]);
}

async function getActiveServiceWorker(): Promise<ServiceWorkerRegistration> {
  // Browsers deduplicate registrations for the same scope; reusing a cached
  // registration avoids triggering an update() network check on every retry.
  if (cachedSwRegistration && cachedSwRegistration.active) {
    return cachedSwRegistration;
  }

  // FCM requires the service worker to be registered at the root scope.
  // Use updateViaCache: 'none' to always fetch the latest version
  const reg = await navigator.serviceWorker.register(SW_PATH, { 
    scope: '/', 
    updateViaCache: 'none'
  });
  cachedSwRegistration = reg;

  // Try to update the service worker to the latest version. Failures here are
  // non-fatal but are logged so they show up in diagnostics / troubleshooting.
  try {
    await reg.update();
  } catch (e) {
    console.warn('Service worker update() failed (non-fatal):', e);
  }

  // If the registration already has an active worker, use it immediately.
  if (reg.active) {
    return reg;
  }

  // Wait for the new service worker to become active and control the page, but
  // bound the wait with a timeout so registerFcmWebToken() never hangs forever
  // (e.g. if the SW script fails to load or SW registration is blocked).
  const readyReg = await withTimeout(
    navigator.serviceWorker.ready,
    SW_ACTIVATE_TIMEOUT_MS,
    reg
  );
  return readyReg;
}

export async function registerFcmWebToken(): Promise<string | null> {
  const diag: WebPushDiagnostic = {
    supported: false,
    configOk: false,
    configProjectId: FIREBASE_WEB_CONFIG.projectId || '',
    permission: (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported',
    swRegistered: false,
    swActive: false,
    token: null,
    error: null,
    networkProbe: null,
  };
  lastWebPushDiagnostic = diag;

  diag.supported = isWebPushSupported();
  if (!diag.supported) {
    diag.error = 'Web Push supported nahi hai (serviceWorker / PushManager / Notification missing)';
    return null;
  }

  diag.configOk = !!(FIREBASE_WEB_CONFIG.apiKey && FIREBASE_WEB_CONFIG.projectId && FIREBASE_WEB_CONFIG.appId);
  if (!diag.configOk) {
    diag.error = 'Firebase web config missing hai';
    return null;
  }

  // Stage 1: permission
  try {
    const permission = await Notification.requestPermission();
    diag.permission = permission;
    if (permission !== 'granted') {
      diag.error = 'Notification permission "Allow" nahi hai (status: ' + permission + '). Browser lock icon -> Notifications -> Allow karein.';
      return null;
    }
  } catch (e) {
    diag.error = 'Permission request failed: ' + errMsg(e);
    return null;
  }

  // Stage 2: Firebase SDK init
  let messaging: any;
  try {
    messaging = await getMessaging();
  } catch (e) {
    diag.error = 'Firebase SDK init failed: ' + errMsg(e);
    return null;
  }

  // Stage 3: service worker register and wait for active
  let swRegistration: ServiceWorkerRegistration;
  try {
    swRegistration = await getActiveServiceWorker();
    diag.swRegistered = true;
    diag.swActive = swRegistration.active !== null;
  } catch (e) {
    diag.error = 'Service Worker register failed: ' + errMsg(e);
    return null;
  }

  // Stage 4: getToken (network)
  try {
    const token = await getToken(messaging, { 
      vapidKey: FIREBASE_VAPID_KEY, 
      serviceWorkerRegistration: swRegistration 
    });
    diag.token = token || null;
    if (!token) {
      diag.error = 'getToken() ne empty token diya';
    }
    return token || null;
  } catch (e) {
    const gstatic = await probeReachable('https://www.gstatic.com/');
    const sdkCors = await probeCorsReachable('https://firebasestorage.googleapis.com/');
    const installations = await probeReachable('https://firebaseinstallations.googleapis.com/');
    const fcmRegistrations = await probeReachable('https://fcmregistrations.googleapis.com/');
    diag.networkProbe = { gstatic: gstatic, installations: installations, fcmRegistrations: fcmRegistrations };

    let hint = '';
    if (!installations) hint += ' | firebaseinstallations.googleapis.com UNREACHABLE';
    if (!fcmRegistrations) hint += ' | fcmregistrations.googleapis.com UNREACHABLE';
    if (!sdkCors) {
      hint += ' | Firebase APIs CORS blocked - browser extension या network policy issue ho sakta hai';
    }
    if (gstatic && installations && fcmRegistrations) {
      hint += ' | Browser cache clear karke refresh karein ya incognito mode me try karein';
    }

    diag.error = 'getToken failed: ' + errMsg(e) + hint + ' (probe: gstatic=' + gstatic + ', installations=' + installations + ', fcmReg=' + fcmRegistrations + ', sdkCors=' + sdkCors + ')';
    console.error('Web push token registration failed', e);
    return null;
  }
}

export async function subscribeFcmWebTopics(token: string, topics: string[]): Promise<string[]> {
  if (!isWebPushSupported()) return [];
  if (!FIREBASE_WEB_CONFIG.apiKey || !FIREBASE_WEB_CONFIG.projectId || !FIREBASE_WEB_CONFIG.appId) return [];
  if (!token || !topics || !topics.length) return [];
  
  // Note: Topic subscription is typically done server-side via Admin SDK
  // Client-side topic subscription is not directly supported in modular SDK
  console.warn('Topic subscription should be done server-side via Firebase Admin SDK');
  return [];
}

export async function onForegroundFcmMessage(callback: (payload: any) => void): Promise<() => void> {
  if (!isWebPushSupported()) return function () {};
  if (!FIREBASE_WEB_CONFIG.apiKey || !FIREBASE_WEB_CONFIG.projectId || !FIREBASE_WEB_CONFIG.appId) return function () {};
  try {
    const messaging = await getMessaging();
    return onMessage(messaging, callback);
  } catch (e) {
    console.error('onMessage subscription failed:', e);
    return function () {};
  }
}

export async function onFcmTokenRefresh(callback: (token: string) => void): Promise<() => void> {
  if (!isWebPushSupported()) return function () {};
  if (!FIREBASE_WEB_CONFIG.apiKey || !FIREBASE_WEB_CONFIG.projectId || !FIREBASE_WEB_CONFIG.appId) return function () {};
  
  // Token refresh in modular SDK is handled by monitoring token changes
  // This is typically done by periodically calling getToken()
  console.warn('Token refresh monitoring should be implemented via periodic getToken() calls');
  return function () {};
}
