// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

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

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message received:', payload);

  const notificationTitle = payload.notification?.title || 'NZ Sport Club';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.type || 'default',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true,
    renotify: true,
    actions: [
      { action: 'open', title: '🔍 View Details' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[FCM SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const workoutId = event.notification.data?.workoutId;
  const notificationType = event.notification.data?.type;
  
  let urlToOpen = '/dashboard';
  if (workoutId && notificationType !== 'workout_deleted') {
    urlToOpen = `/dashboard?workout=${workoutId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              workoutId: workoutId,
              notificationType: notificationType
            });
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[FCM SW] Notification closed');
});
