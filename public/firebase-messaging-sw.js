// Firebase Cloud Messaging Service Worker
// Updated to Firebase v11.x (latest stable)
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

const CACHE_VERSION = 'fcm-sw-v2';

const firebaseConfig = {
  apiKey: "AIzaSyB77lAHEx-XN7ZPYjwRmikCTYi_BEzS9dk",
  authDomain: "pushnotsnz.firebaseapp.com",
  projectId: "pushnotsnz",
  storageBucket: "pushnotsnz.firebasestorage.app",
  messagingSenderId: "370180691160",
  appId: "1:370180691160:web:3297f6c807f7427c0d73ad",
  measurementId: "G-09XBG6201R"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages with proper payload parsing
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message received:', payload);

  // Handle both notification and data messages
  const notificationTitle = payload.notification?.title || payload.data?.title || 'NZ Sport Club';
  const notificationBody = payload.notification?.body || payload.data?.body || 'You have a new notification';
  
  const notificationOptions = {
    body: notificationBody,
    icon: payload.notification?.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.type || 'nz-notification',
    data: {
      ...payload.data,
      FCM_MSG: payload, // Store original payload for click handling
    },
    vibrate: [200, 100, 200],
    requireInteraction: true,
    renotify: true,
    actions: [
      { action: 'open', title: '🔍 View Details' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ],
    // Silent flag for data-only messages
    silent: !payload.notification,
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click with proper navigation
self.addEventListener('notificationclick', (event) => {
  console.log('[FCM SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const data = event.notification.data || {};
  const workoutId = data.workoutId;
  const notificationType = data.type;
  
  let urlToOpen = '/dashboard';
  if (workoutId && notificationType !== 'workout_deleted') {
    urlToOpen = `/dashboard?workout=${workoutId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              workoutId: workoutId,
              notificationType: notificationType
            });
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[FCM SW] Notification closed');
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('fcm-sw-') && name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    })
  );
});
