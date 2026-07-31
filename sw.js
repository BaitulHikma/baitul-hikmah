// ============================================================================
// SERVICE WORKER — runs in the background even when the site/app is closed.
// Two jobs: (1) cache the app shell so it opens instantly and works offline,
// (2) receive push notifications sent from Code.gs via Firebase.
// ============================================================================

const CACHE_NAME = 'baitul-hikmah-v3';
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

// Network-first for the Apps Script API (always want fresh data), cache-first
// for everything else in the app shell (so the app opens instantly).
// Network-first for the Apps Script API AND for the app's own code files
// (html/css/js) — this is the fix for "changes I push don't show up until
// much later": code files must always prefer the live network copy when
// online, falling back to cache only if genuinely offline. Only truly
// static assets (icons) are cache-first, since those never change.
const CODE_FILE_PATTERN = /\.(html|css|js|json)(\?|$)/;

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.indexOf('script.google.com') !== -1) return; // never cache API calls

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

// ---------------------------------------------------------------------------
// PUSH NOTIFICATIONS (Firebase Cloud Messaging)
// firebase-config.js defines FIREBASE_CONFIG — loaded here via importScripts
// so this one config object is shared with app.js instead of duplicated.
// ---------------------------------------------------------------------------
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  importScripts('./firebase-config.js');

  if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_YOUR') !== 0) {
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      // Data-only payload — see Code.gs sendPushToUser_ for why (avoids
      // duplicate notifications, keeps display fully under our control).
      const title = (payload.data && payload.data.title) || 'Baitul Hikmah';
      const body = (payload.data && payload.data.body) || '';
      self.registration.showNotification(title, {
        body: body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        requireInteraction: true,   // stays on screen until tapped/dismissed
        vibrate: [200, 100, 200]    // Android: a noticeable double-buzz
      });
    });
  }
} catch (e) {
  // Firebase not configured yet — the rest of the app still works fine
  // without push notifications until firebase-config.js is filled in.
}

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
