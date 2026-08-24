const CACHE_NAME = 'baitul-hikmah-v9';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './firebase-config.js',
  './manifest.json',
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

try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  importScripts('./firebase-config.js');

  if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_YOUR') !== 0) {
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'Baitul Hikmah';
      const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || 'You have a new update.';
      self.registration.showNotification(title, {
        body: body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        requireInteraction: true,
        renotify: true,
        tag: 'bh-notif-' + (payload.data && payload.data.timestamp ? payload.data.timestamp : Date.now()),
        vibrate: [350, 100, 450, 100, 500, 100, 500],
        sound: 'default',
        data: { url: './#profile' }
      });
    });
  }
} catch (e) {
  // Firebase optional
}

// Direct Web Push fallback
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'Baitul Hikmah';
    const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || 'You have a new update.';
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        requireInteraction: true,
        renotify: true,
        tag: 'bh-notif-' + Date.now(),
        vibrate: [350, 100, 450, 100, 500, 100, 500],
        sound: 'default',
        data: { url: './#profile' }
      })
    );
  } catch (e) {
    // Non-json payload fallback
    const text = event.data.text() || 'New alert from Baitul Hikmah';
    event.waitUntil(
      self.registration.showNotification('Baitul Hikmah', {
        body: text,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        requireInteraction: true,
        vibrate: [350, 100, 450, 100, 500, 100, 500],
        data: { url: './#profile' }
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
