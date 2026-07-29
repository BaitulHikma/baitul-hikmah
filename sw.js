// ============================================================================
// SERVICE WORKER — runs in the background even when the site/app is closed.
// Handles app shell caching and 100% reliable background push notifications.
// ============================================================================

const CACHE_NAME = 'baitul-hikmah-v2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for API calls, cache-first for app shell
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.indexOf('script.google.com') !== -1) return; // never cache backend API

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ---------------------------------------------------------------------------
// PUSH NOTIFICATIONS (Firebase Cloud Messaging + Native Web Push)
// ---------------------------------------------------------------------------
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  importScripts('./firebase-config.js');

  if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_YOUR') !== 0) {
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      
      const title = notification.title || data.title || 'Baitul Hikmah';
      const body = notification.body || data.body || 'You have a new library update.';
      const clickUrl = data.url || './#profile';

      const options = {
        body: body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200, 100, 200], // BOLD mobile vibration
        requireInteraction: true,           // Stays on screen until tapped
        renotify: true,
        tag: data.tag || 'bh-notification-' + Date.now(),
        data: { url: clickUrl }
      };

      return self.registration.showNotification(title, options);
    });
  }
} catch (e) {
  console.warn('Firebase Messaging SW error:', e);
}

// Fallback for native Web Push API payload
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const payload = event.data.json();
      const title = payload.title || payload.notification?.title || 'Baitul Hikmah';
      const body = payload.body || payload.notification?.body || '';
      const clickUrl = payload.url || payload.data?.url || './#profile';

      event.waitUntil(
        self.registration.showNotification(title, {
          body: body,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          renotify: true,
          tag: 'bh-push-' + Date.now(),
          data: { url: clickUrl }
        })
      );
    } catch (err) {
      // Plain text payload fallback
      const text = event.data.text();
      event.waitUntil(
        self.registration.showNotification('Baitul Hikmah', {
          body: text,
          icon: './icons/icon-192.png',
          vibrate: [200, 100, 200]
        })
      );
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './#profile';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
