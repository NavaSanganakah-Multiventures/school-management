/**
 * Firebase Web Push for Cloudflare Workers
 * Server-side token management to bypass CORS issues
 */

'use client';

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
 * Check if Web Push is supported
 */
export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Register Web Push Token (Server-Side Approach for Workers)
 * 
 * This bypasses Firebase CORS issues by:
 * 1. Requesting browser notification permission
 * 2. Sending user info to backend
 * 3. Backend manages FCM tokens server-side
 * 4. Returns server-generated token
 */
export async function registerFcmWebToken(userId: string): Promise<string | null> {
  const diag: WebPushDiagnostic = {
    supported: false,
    permission: 'unsupported',
    serverSide: true,
    token: null,
    error: null,
    platform: 'cloudflare-workers'
  };
  lastDiagnostic = diag;

  // Check browser support
  diag.supported = isWebPushSupported();
  if (!diag.supported) {
    diag.error = 'Web Push not supported in this browser';
    return null;
  }

  // Request notification permission
  try {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      diag.permission = permission;

      if (permission !== 'granted') {
        diag.error = `Notification permission ${permission}. Please click "Allow" when prompted.`;
        return null;
      }
    }
  } catch (error: any) {
    diag.error = 'Permission request failed: ' + error.message;
    return null;
  }

  // Register token via backend (server-side)
  try {
    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timestamp: new Date().toISOString()
    };

    const response = await fetch('/api/fcm-proxy/register-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        deviceInfo,
        fcmToken: null // Server will generate
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server returned ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success && result.token) {
      diag.token = result.token;
      diag.error = null;
      
      // Store token locally for quick access
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fcm_web_token', result.token);
        localStorage.setItem('fcm_web_token_timestamp', Date.now().toString());
      }
      
      return result.token;
    } else {
      throw new Error(result.error || 'Token registration failed');
    }

  } catch (error: any) {
    diag.error = 'Server-side token registration failed: ' + error.message;
    console.error('FCM registration error:', error);
    return null;
  }
}

/**
 * Send test notification
 */
export async function sendTestNotification(
  userId: string, 
  title?: string, 
  body?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/fcm-proxy/test-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, title, body })
    });

    const result = await response.json();
    
    if (result.success) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: result.error || 'Test notification failed' 
      };
    }

  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Check FCM server configuration status
 */
export async function checkFcmStatus(): Promise<{
  configured: boolean;
  serverSide: boolean;
  error?: string;
}> {
  try {
    const response = await fetch('/api/fcm-proxy/status');
    const result = await response.json();
    
    return {
      configured: result.fcmConfigured,
      serverSide: result.serverSideFcm,
    };

  } catch (error: any) {
    return {
      configured: false,
      serverSide: true,
      error: error.message
    };
  }
}

/**
 * Get stored token from localStorage
 */
export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  
  const token = localStorage.getItem('fcm_web_token');
  const timestamp = localStorage.getItem('fcm_web_token_timestamp');
  
  // Token valid for 30 days
  if (token && timestamp) {
    const age = Date.now() - parseInt(timestamp);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    if (age < thirtyDays) {
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
