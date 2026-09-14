'use client';

/**
 * Firebase Web Push - Unified Implementation for Cloudflare Workers & Web
 * 
 * Supports:
 * 1. Web Browser: Firebase Web Messaging Modular SDK (getToken via service worker)
 * 2. Mobile / Flutter: Server-side token registry via /api/notifications/register-token
 * 3. Topic Broadcasting: Multi-tenant isolated topics via Google Cloud FCM HTTP v1 API
 */

import { FIREBASE_WEB_CONFIG, FIREBASE_VAPID_KEY } from './firebase-client-config';
import { isRealFcmToken } from '../api/lib/fcm';

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
 * Check if Web Push is supported in current browser
 */
export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Get stored FCM registration token from localStorage
 */
export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const token = localStorage.getItem('fcm_web_token');
  const timestamp = localStorage.getItem('fcm_web_token_timestamp');
  if (token && timestamp && isRealFcmToken(token)) {
    const age = Date.now() - parseInt(timestamp, 10);
    // Token valid for 30 days
    if (age < 30 * 24 * 60 * 60 * 1000) {
      return token;
    }
  }
  return null;
}

/**
 * Clear stored token
 */
export function clearStoredToken(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem('fcm_web_token');
  localStorage.removeItem('fcm_web_token_timestamp');
}

export interface RegisterTokenOptions {
  schoolId?: string;
  role?: string;
  topics?: string[];
}

/**
 * Register FCM Web Token
 * Requests browser permission, registers Service Worker, and attempts genuine Google FCM token via Web SDK.
 * If successful, syncs token to backend D1 database for targeted dispatch.
 */
export async function registerFcmWebToken(
  userId?: string | number,
  options?: RegisterTokenOptions
): Promise<string | null> {
  const diag: WebPushDiagnostic = {
    supported: false,
    permission: 'unsupported',
    serverSide: true,
    token: null,
    error: null,
    platform: 'web',
  };
  lastDiagnostic = diag;

  if (!userId) {
    diag.error = 'userId required for FCM registration';
    return null;
  }

  diag.supported = isWebPushSupported();
  if (!diag.supported) {
    diag.error = 'Web Push not supported in this browser';
    return null;
  }

  // 1. Check local storage cache for existing genuine token
  const cached = getStoredToken();
  if (cached && isRealFcmToken(cached)) {
    diag.token = cached;
    diag.permission = Notification.permission;
    return cached;
  }

  // 2. Request Notification Permission
  try {
    const permission = await Notification.requestPermission();
    diag.permission = permission;
    if (permission !== 'granted') {
      diag.error = `Notification permission: ${permission}. Browser settings me allow karein.`;
      return null;
    }
  } catch (permErr: any) {
    diag.error = 'Permission request failed: ' + (permErr?.message || String(permErr));
    return null;
  }

  // 3. Register service worker and attempt Firebase Web SDK getToken()
  let fcmToken: string | null = null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');

    const supported = await isSupported().catch(() => false);
    if (supported && FIREBASE_WEB_CONFIG.apiKey && FIREBASE_VAPID_KEY) {
      const app = getApps().length ? getApp() : initializeApp(FIREBASE_WEB_CONFIG);
      const messaging = getMessaging(app);
      fcmToken = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: reg,
      }).catch((tokenErr: any) => {
        console.log('[FCM] Web SDK getToken notice:', tokenErr?.message || tokenErr);
        return null;
      });
    }
  } catch (sdkErr: any) {
    console.log('[FCM] Web SDK initialization notice:', sdkErr?.message || sdkErr);
  }

  // 4. If genuine Google FCM token obtained, store locally and sync to backend
  if (fcmToken && isRealFcmToken(fcmToken)) {
    diag.token = fcmToken;
    try {
      localStorage.setItem('fcm_web_token', fcmToken);
      localStorage.setItem('fcm_web_token_timestamp', Date.now().toString());
    } catch {}

    const schoolId = options?.schoolId || 'school-01';
    const role = options?.role || 'Staff';
    const topics = options?.topics || ['school_' + schoolId + '_all'];

    // Sync to /api/notifications/register-token
    await fetch('/api/notifications/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fcmToken,
        schoolId,
        role,
        userId: String(userId),
        deviceType: 'web',
        platform: 'web',
        topics,
      }),
    }).catch(() => {});

    // Sync to /api/fcm-proxy/register-token
    await fetch('/api/fcm-proxy/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken,
        userId: String(userId),
        schoolId,
        role,
        topics,
        deviceInfo: { userAgent: navigator.userAgent, platform: navigator.platform },
      }),
    }).catch(() => {});

    return fcmToken;
  }

  // If token could not be obtained (e.g. workers.dev origin CORS or browser restrictions)
  diag.error = 'वेब टोकन अनुपलब्ध (इस डोमेन पर Google CORS प्रतिबंध या सर्विस वर्कर सीमा)। मोबाइल ऐप व कस्टम डोमेन पर टोकन स्वतः सक्रिय रहेगा।';
  return null;
}

/**
 * Send test notification
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
 * Check if FCM is configured on server
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

/**
 * Topic subscription helper - server-side managed
 */
export async function subscribeFcmWebTopics(token: string, topics: string[]): Promise<string[]> {
  return topics;
}

/**
 * Foreground message listener - listens for push notification events via service worker
 */
export async function onForegroundFcmMessage(callback: (payload: any) => void): Promise<() => void> {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    const handler = (event: MessageEvent) => {
      if (event.data && (event.data.type === 'FCM_NOTIFICATION' || event.data.notification)) {
        callback(event.data);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }
  return () => {};
}

/**
 * Token refresh listener
 */
export async function onFcmTokenRefresh(callback: (token: string) => void): Promise<() => void> {
  return () => {};
}
