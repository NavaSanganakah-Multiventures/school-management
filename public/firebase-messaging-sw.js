// Firebase Cloud Messaging service worker (background push for the website).
// AUTO-GENERATED at build time by scripts/generate-firebase-sw.js from
// NEXT_PUBLIC_FIREBASE_WEB_CONFIG_JSON (GitHub Secret FIREBASE_WEB_CONFIG_JSON).
// The checked-in version below is the DISABLED fallback: do not put the real config here.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const FIREBASE_WEB_CONFIG = {};

// Activate immediately so FCM getToken doesn't fail while the SW is still waiting.
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

if (FIREBASE_WEB_CONFIG.apiKey && FIREBASE_WEB_CONFIG.projectId && FIREBASE_WEB_CONFIG.appId) {
  firebase.initializeApp(FIREBASE_WEB_CONFIG);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(function (payload) {
    try {
      const notification = payload.notification || {};
      const title = notification.title || 'विद्या सेतु सूचना';
      const options = {
        body: notification.body || '',
        data: payload.data || {},
      };
      self.registration.showNotification(title, options);
    } catch (e) {
      console.error('FCM background notification failed:', e);
    }
  });
}
