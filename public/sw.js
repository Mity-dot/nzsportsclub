// Service Worker for Push Notifications - NZ Sport Club

const APP_NAME = 'NZ Sport Club';

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = {
    title: APP_NAME,
    body: 'You have a new notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'default',
    data: {}
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('[SW] Push payload:', payload);
      
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.data?.type || 'default',
        data: payload.data || {}
      };
    } catch (e) {
      console.log('[SW] Failed to parse push data, using text');
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: [200, 100, 200],
    requireInteraction: true, // Keep notification visible until user interacts
    renotify: true, // Notify even if same tag
    actions: [
      { action: 'open', title: '🔍 View Details' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Default action or 'open' action - open the dashboard
  const workoutId = event.notification.data?.workoutId;
  const notificationType = event.notification.data?.type;
  
  let urlToOpen = '/dashboard';
  if (workoutId && notificationType !== 'workout_deleted') {
    urlToOpen = `/dashboard?workout=${workoutId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
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
        // No window open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});
