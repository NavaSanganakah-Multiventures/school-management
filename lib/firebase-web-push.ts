'use client';

import { fetchFirebaseConfig, FIREBASE_VAPID_KEY } from './firebase-client-config';

/**
 * Native Web Push registration (browser PushManager + service worker).
 *
 * Background notifications now work even when the tab is closed:
 *   1. Request Notification permission.
 *   2. Register the service worker (public/firebase-messaging-sw.js handles the "push" event).
 *   3. Subscribe via PushManager.subscribe() with the Firebase VAPID public key.
 *   4. Send the full PushSubscription JSON to /api/notifications/register-web-push.
 *
 * There are NO client-side calls to firebaseinstallations.googleapis.com or
 * Firebase getToken(): this avoids the CORS problems seen on workers.dev.
 */

export type WebPushDiagnostic = {
  supported: boolean;
  permission: string;
  serverSide: boolean;
  token: string | null;
  error: string | null;
  platform: string;
};

let lastDiagnostic: WebPushDiagnostic | null = null;

export function getWebPushDiagnostic(): WebPushDiagnostic | null {
  return lastDiagnostic;
}

/**
 * Check if Web Push / Notification is supported in current browser
 */
export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('vidyasetu_device_registered');
}

export function clearStoredToken(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem('vidyasetu_device_registered');
}

export interface RegisterTokenOptions {
  schoolId?: string;
  role?: string;
  topics?: string[];
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * Register a real browser PushSubscription (native Web Push) with the backend.
 * Returns the push subscription endpoint on success, or null on failure.
 */
export async function registerFcmWebToken(
  userId?: string | number,
  options?: RegisterTokenOptions
): Promise<string | null> {
  const isSupported = isWebPushSupported();
  const currentPermission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  const diag: WebPushDiagnostic = {
    supported: isSupported,
    permission: currentPermission,
    serverSide: true,
    token: null,
    error: null,
    platform: 'web',
  };
  lastDiagnostic = diag;

  if (!userId) {
    diag.error = 'userId required for Web Push registration';
    return null;
  }

  if (!isSupported) {
    diag.error = 'Web Push notifications are not supported in this browser';
    return null;
  }

  // 1. Request notification permission if not yet decided
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      diag.permission = permission;
      if (permission !== 'granted') {
        diag.error = 'Notification permission: ' + permission;
        return null;
      }
    }
  } catch (err: any) {
    diag.error = 'Permission error: ' + (err?.message || String(err));
    return null;
  }

  // 2. Clear any stale Firebase IndexedDB databases (completely prevents VersionError)
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    try {
      window.indexedDB.deleteDatabase('firebase-messaging-database');
      window.indexedDB.deleteDatabase('firebaseInstallations');
    } catch (_) {}
  }

  const schoolId = options?.schoolId || 'school-01';
  const role = options?.role || 'Staff';
  const topics = options?.topics || ['school_' + schoolId + '_all'];

  // 3. Register the service worker and subscribe via the native PushManager API
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      diag.error = 'Service Worker or PushManager API is unavailable.';
      return null;
    }

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js?v=2.1.0', { scope: '/' });
    await reg.update().catch(() => {});
    await navigator.serviceWorker.ready;

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const runtimeConfig = await fetchFirebaseConfig();
      const vapidKey = runtimeConfig.vapidKey || FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        diag.error = 'Firebase VAPID key is not configured.';
        return null;
      }
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const subJSON = subscription.toJSON();

    // 4. Persist the full PushSubscription on the server (endpoint + p256dh + auth)
    const res = await fetch('/api/notifications/register-web-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: String(userId),
        schoolId,
        role,
        topics,
        subscription: subJSON,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || ('HTTP ' + res.status));
    }

    const endpoint = subJSON.endpoint || (data.endpoint as string);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vidyasetu_device_registered', endpoint);
    }
    diag.token = endpoint;
    return endpoint;
  } catch (e: any) {
    diag.error = e?.message || 'Web Push subscription registration failed';
    return null;
  }
}

/**
 * Send test notification via server (supports FCM mobile and native Web Push)
 */
export async function sendTestNotification(
  userId: string | number,
  title?: string,
  body?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/fcm-proxy/test-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: String(userId), title, body }),
    });
    const data = await res.json().catch(() => ({}));
    return { success: !!data.success, error: data.error };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Check if FCM HTTP v1 is configured on server
 */
export async function checkFcmStatus(): Promise<{
  configured: boolean;
  serverSide: boolean;
  error?: string;
}> {
  try {
    const res = await fetch('/api/fcm-proxy/status');
    const data = await res.json().catch(() => ({}));
    return {
      configured: !!data.fcmConfigured,
      serverSide: true,
    };
  } catch (e: any) {
    return {
      configured: false,
      serverSide: true,
      error: e?.message,
    };
  }
}

export async function subscribeFcmWebTopics(token: string, topics: string[]): Promise<string[]> {
  return topics;
}

export async function onForegroundFcmMessage(callback: (payload: any) => void): Promise<() => void> {
  const disposers: Array<() => void> = [];

  if (typeof window !== 'undefined') {
    // 1. Service Worker postMessage listener
    if ('serviceWorker' in navigator) {
      const swHandler = (event: MessageEvent) => {
        if (event.data && (event.data.type === 'FCM_NOTIFICATION' || event.data.notification)) {
          callback(event.data);
        }
      };
      navigator.serviceWorker.addEventListener('message', swHandler);
      disposers.push(() => navigator.serviceWorker.removeEventListener('message', swHandler));
    }

    // 2. BroadcastChannel listener across all browser tabs
    try {
      const bc = new BroadcastChannel('vidyasetu_fcm');
      bc.onmessage = (event) => {
        if (event.data && (event.data.type === 'FCM_NOTIFICATION' || event.data.notification)) {
          callback(event.data);
        }
      };
      disposers.push(() => {
        try { bc.close(); } catch (_) {}
      });
    } catch (_) {}

    // 3. Window CustomEvent listener
    const domHandler = (event: any) => {
      if (event.detail && (event.detail.type === 'FCM_NOTIFICATION' || event.detail.notification)) {
        callback(event.detail);
      }
    };
    window.addEventListener('fcm_notification', domHandler);
    disposers.push(() => window.removeEventListener('fcm_notification', domHandler));
  }

  return () => {
    disposers.forEach((d) => {
      try { d(); } catch (_) {}
    });
  };
}

export async function onFcmTokenRefresh(callback: (token: string) => void): Promise<() => void> {
  return () => {};
}
