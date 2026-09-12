// Firebase Cloud Messaging service worker (background push for the website).
// Served at /firebase-messaging-sw.js from static assets.
// IMPORTANT: keep the config below in sync with lib/firebase-client-config.ts.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'vidyasetu-school-fcm',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const notification = payload.notification || {};
  const title = notification.title || 'विद्या सेतु सूचना';
  const options = {
    body: notification.body || '',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});
