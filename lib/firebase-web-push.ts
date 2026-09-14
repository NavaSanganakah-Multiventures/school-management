'use client';

/**
 * Firebase Web Push - Server-Side Implementation for Cloudflare Workers
 * 
 * This file is a WRAPPER that redirects all FCM operations to server-side implementation.
 * No client-side Firebase SDK calls - everything goes through backend API.
 * 
 * WHY SERVER-SIDE?
 * - Avoids CORS issues on workers.dev subdomain
 * - Better security (tokens managed server-side)
 * - Faster (no Firebase SDK bundle in client)
 * - Works on any domain (workers.dev, custom domain, localhost)
 * 
 * USAGE:
 * import { registerFcmWebToken } from '@/lib/firebase-web-push';
 * const token = await registerFcmWebToken(userId);
 */

import { 
  registerFcmWebToken as registerServerSide,
  sendTestNotification as testServerSide,
  checkFcmStatus as checkServerSide,
  getWebPushDiagnostic as getDiagnosticServerSide,
  isWebPushSupported,
  getStoredToken,
  clearStoredToken,
  type WebPushDiagnostic
} from './firebase-web-push-workers';

// Re-export all server-side functions
export { isWebPushSupported, getStoredToken, clearStoredToken };
export type { WebPushDiagnostic };

/**
 * Get current diagnostic information
 */
export function getWebPushDiagnostic(): WebPushDiagnostic | null {
  return getDiagnosticServerSide();
}

/**
 * Register FCM Web Token (Server-Side)
 * 
 * @param userId - User ID from authenticated session (required)
 * @returns Token string or null if failed
 * 
 * @example
 * const userId = getCurrentUser().id;
 * const token = await registerFcmWebToken(userId);
 * if (token) {
 *   console.log('Notifications enabled!');
 * }
 */
export async function registerFcmWebToken(userId?: string | number): Promise<string | null> {
  if (!userId) {
    console.error('❌ userId required for FCM registration');
    return null;
  }
  
  console.log('🔔 Registering FCM token via server-side API...');
  return await registerServerSide(String(userId));
}

/**
 * Send test notification
 * 
 * @param userId - User ID
 * @param title - Notification title (optional)
 * @param body - Notification body (optional)
 */
export async function sendTestNotification(
  userId: string | number,
  title?: string,
  body?: string
): Promise<{ success: boolean; error?: string }> {
  return await testServerSide(String(userId), title, body);
}

/**
 * Check if FCM is configured on server
 */
export async function checkFcmStatus(): Promise<{
  configured: boolean;
  serverSide: boolean;
  error?: string;
}> {
  return await checkServerSide();
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
