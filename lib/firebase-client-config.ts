// Public Firebase Web App configuration (NOT secret). These values are safe to expose
// in the browser; the website needs them to RECEIVE push notifications.
//
// IMPORTANT: replace the placeholders below with your Firebase project's Web App config:
//   Firebase Console -> Project settings -> General -> Your apps -> Web app -> SDK config
// and the VAPID public key from:
//   Firebase Console -> Cloud Messaging -> Web Push certificates -> "Key"
// Keep public/firebase-messaging-sw.js in sync with these values.

export const FIREBASE_WEB_CONFIG = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'vidyasetu-school-fcm',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const FIREBASE_VAPID_KEY = 'YOUR_VAPID_PUBLIC_KEY';
