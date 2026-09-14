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
  token: string | null;
  error: string | null;
};

let lastWebPushDiagnostic: WebPushDiagnostic | null = null;

export function getWebPushDiagnostic(): WebPushDiagnostic | null {
  return lastWebPushDiagnostic;
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

export async function registerFcmWebToken(): Promise<string | null> {
  const diag: WebPushDiagnostic = {
    supported: false,
    configOk: false,
    configProjectId: FIREBASE_WEB_CONFIG.projectId || '',
    permission: (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported',
    swRegistered: false,
    token: null,
    error: null,
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

  try {
    const permission = await Notification.requestPermission();
    diag.permission = permission;
    if (permission !== 'granted') {
      diag.error = 'Notification permission "Allow" nahi hai (status: ' + permission + '). Browser lock icon -> Notifications -> Allow karein.';
      return null;
    }
    const messaging = await getMessaging();
    const swRegistration = await navigator.serviceWorker.register(SW_PATH);
    diag.swRegistered = true;
    const token = await messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: swRegistration });
    diag.token = token || null;
    if (!token) {
      diag.error = 'getToken() ne empty token diya';
    }
    return token || null;
  } catch (e: any) {
    const msg = (e && e.message) ? String(e.message) : ((e && e.code) ? String(e.code) : String(e));
    diag.error = 'getToken/SW failed: ' + msg;
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
