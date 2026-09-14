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
 * Register Web Push Token (Server-Side)
 * 
 * @param userId - User ID from authenticated session
 * @returns Token string or null
 * 
 * @example
 * const userId = getCurrentUser().id;
 * const token = await registerFcmWebToken(userId);
 * if (token) {
 *   console.log('Notifications enabled!');
 * }
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
    console.warn('⚠️ Web Push not supported');
    return null;
  }

  // Request notification permission
  try {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      diag.permission = permission;

      if (permission !== 'granted') {
        diag.error = `Notification permission ${permission}. Please click "Allow" when prompted.`;
        console.warn('⚠️ Notification permission not granted:', permission);
        return null;
      }
    }
  } catch (error: any) {
    diag.error = 'Permission request failed: ' + error.message;
    console.error('❌ Permission request failed:', error);
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

    console.log('📡 Calling backend API: /api/fcm-proxy/register-token');

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

    console.log('📡 Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend returned error:', response.status, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || `Server returned ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Backend response:', result);
    
    if (result.success && result.token) {
      diag.token = result.token;
      diag.error = result.warning || null;
      
      // Store token locally for quick access
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fcm_web_token', result.token);
        localStorage.setItem('fcm_web_token_timestamp', Date.now().toString());
      }
      
      console.log('✅ Token registered successfully:', result.token);
      return result.token;
    } else {
      throw new Error(result.error || 'Token registration failed');
    }

  } catch (error: any) {
    diag.error = 'Server-side token registration failed: ' + error.message;
    console.error('❌ FCM registration error:', error);
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
