'use client';

import { FIREBASE_VAPID_KEY, FIREBASE_WEB_CONFIG } from './firebase-client-config';

const SDK_VERSION = '10.14.1';
const SW_PATH = '/firebase-messaging-sw.js';

let initPromise: Promise<any> | null = null;

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
    return res.type !== 'opaque';
  } catch (e) {
    return false;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('browser only')); return; }
    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = function () { resolve(); };
    el.onerror = function () { reject(new Error('Firebase SDK load failed: ' + src)); };
    document.head.appendChild(el);
  });
}

async function getMessaging(): Promise<any> {
  const w = (typeof window === 'undefined' ? null : window) as any;
  if (!w) throw new Error('browser only');
  if (w.__vidyasetuMessaging) return w.__vidyasetuMessaging;
  if (!initPromise) {
    initPromise = (async () => {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-messaging-compat.js');
      const fb = w.firebase;
      if (!fb) throw new Error('Firebase SDK not available');
      const app = fb.apps && fb.apps.length ? fb.apps[0] : fb.initializeApp(FIREBASE_WEB_CONFIG);
      const messaging = fb.messaging(app);
      w.__vidyasetuMessaging = messaging;
      return messaging;
    })();
  }
  return initPromise;
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function getActiveServiceWorker(): Promise<ServiceWorkerRegistration> {
  // FCM requires the service worker to be registered at the root scope.
  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/', updateViaCache: 'none' });

  // Try to update the service worker to the latest version. Failures here are non-fatal.
  try {
    await reg.update();
  } catch (_) { /* ignore */ }

  // If the registration already has an active worker, use it immediately.
  if (reg.active) {
    return reg;
  }

  // Wait for the new service worker to become active and control the page.
  // This prevents getToken from failing with "Failed to fetch" when the SW
  // is still installing/activating.
  return navigator.serviceWorker.ready;
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
    const token = await messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: swRegistration });
    diag.token = token || null;
    if (!token) {
      diag.error = 'getToken() ne empty token diya';
    }
    return token || null;
  } catch (e) {
    const gstatic = await probeReachable('https://www.gstatic.com/');
    const sdkCors = await probeCorsReachable('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
    const installations = await probeReachable('https://firebaseinstallations.googleapis.com/');
    const fcmRegistrations = await probeReachable('https://fcmregistrations.googleapis.com/');
    diag.networkProbe = { gstatic: gstatic, installations: installations, fcmRegistrations: fcmRegistrations };

    let hint = '';
    if (!installations) hint += ' | firebaseinstallations.googleapis.com UNREACHABLE';
    if (!fcmRegistrations) hint += ' | fcmregistrations.googleapis.com UNREACHABLE';
    if (gstatic && installations && fcmRegistrations && !sdkCors) {
      hint += ' | possible CDN script blocker / CORS restriction (gstatic CORS probe failed)';
    }
    if (gstatic && installations && fcmRegistrations) {
      hint += ' | ad blocker / privacy extension ya stale service worker issue ho sakta hai. Try page refresh ya browser cache clear karein.';
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
  const subscribed: string[] = [];
  try {
    const messaging = await getMessaging();
    for (const topic of topics) {
      try {
        await messaging.subscribeToTopic(token, topic);
        subscribed.push(topic);
      } catch (e) {
        console.error('Web push topic subscription failed: ' + topic, e);
      }
    }
  } catch (e) {
    console.error('Web push topic subscription failed', e);
  }
  return subscribed;
}

export async function onForegroundFcmMessage(callback: (payload: any) => void): Promise<() => void> {
  if (!isWebPushSupported()) return function () {};
  if (!FIREBASE_WEB_CONFIG.apiKey || !FIREBASE_WEB_CONFIG.projectId || !FIREBASE_WEB_CONFIG.appId) return function () {};
  try {
    const messaging = await getMessaging();
    return messaging.onMessage(callback);
  } catch (e) {
    return function () {};
  }
}

export async function onFcmTokenRefresh(callback: (token: string) => void): Promise<() => void> {
  if (!isWebPushSupported()) return function () {};
  if (!FIREBASE_WEB_CONFIG.apiKey || !FIREBASE_WEB_CONFIG.projectId || !FIREBASE_WEB_CONFIG.appId) return function () {};
  try {
    const messaging = await getMessaging();
    return messaging.onTokenRefresh(callback);
  } catch (e) {
    return function () {};
  }
}
