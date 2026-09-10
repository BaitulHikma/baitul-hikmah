const CACHE_NAME = 'baitul-hikmah-v14';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/stat_my_books.jpg',
  './assets/stat_borrowed.jpg',
  './assets/stat_lent_out.jpg'
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

const CODE_FILE_PATTERN = /\.(html|css|js|json)(\?|$)/;

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.indexOf('script.google.com') !== -1) return;

  if (CODE_FILE_PATTERN.test(url)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

let firebaseMessagingInitialized = false;

try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  importScripts('./firebase-config.js');

  if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_YOUR') === -1) {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    const messaging = firebase.messaging();
    firebaseMessagingInitialized = true;
  }
} catch (e) {
  console.warn('Firebase background SW init:', e);
}

// Unified, 100% reliable background push listener for FCM and Web Push
self.addEventListener('push', (event) => {
  let title = 'Baitul Hikmah 🔔';
  let body = 'You have a new update.';
  let tag = 'bh-push-' + Date.now();
  let url = './#profile';
  let iconUrl = new URL('icons/icon-192.png', self.location.href).href;
  let badgeUrl = new URL('icons/icon-192.png', self.location.href).href;

  if (event.data) {
    try {
      const payload = event.data.json();
      const n = payload.notification || {};
      const d = payload.data || {};

      title = n.title || d.title || title;
      body = n.body || d.body || body;
      tag = 'bh-notif-' + (d.timestamp || Date.now());
      url = d.url || (payload.fcmOptions && payload.fcmOptions.link) || url;

      if (n.icon) {
        try { iconUrl = new URL(n.icon, self.location.href).href; } catch (_) {}
      }
    } catch (e) {
      const text = event.data.text();
      if (text) body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: iconUrl,
      badge: badgeUrl,
      requireInteraction: true,
      renotify: true,
      tag: tag,
      vibrate: [350, 100, 450, 100, 500, 100, 500],
      sound: 'default',
      data: { url: url }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './#profile';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes('#') && !client.url.includes(targetUrl)) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
