// Activate immediately so background push does not fail while the SW is waiting.
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// Standard Web Push event listener (handles all FCM HTTP v1 notifications directly)
self.addEventListener('push', function (event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    try {
      payload = { notification: { title: 'विद्या सेतु सूचना', body: event.data ? event.data.text() : '' } };
    } catch (_) {}
  }

  const notification = payload.notification || {};
  const title = notification.title || 'विद्या सेतु सूचना';
  const options = {
    body: notification.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: payload.data || {},
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (let i = 0; i < clientList.length; i++) {
          clientList[i].postMessage({
            type: 'FCM_NOTIFICATION',
            notification: notification,
            data: payload.data || {},
          });
        }
      }).catch(function () {})
    ])
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
