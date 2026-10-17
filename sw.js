const CACHE_NAME = 'baitul-hikmah-v17';
const CORE_APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_APP_SHELL))
      .catch((err) => console.warn('Core cache addAll warning:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
    ])
  );
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

// In-memory debounce set to guarantee exactly ONE notification per event
const recentPushTags = new Map();

function isDuplicatePush(tag) {
  const now = Date.now();
  // Purge entries older than 12 seconds
  for (const [key, timestamp] of recentPushTags.entries()) {
    if (now - timestamp > 12000) recentPushTags.delete(key);
  }
  if (recentPushTags.has(tag)) {
    return true; // Already processed recently
  }
  recentPushTags.set(tag, now);
  return false;
}

// Unified, 100% reliable background push listener for FCM and Web Push
self.addEventListener('push', (event) => {
  let title = 'Baitul Hikmah 🔔';
  let body = 'You have a new update.';
  let tag = '';
  let url = './#profile';
  let bookId = '';
  let iconUrl = new URL('icons/icon-192.png', self.location.origin).href;
  let badgeUrl = new URL('icons/icon-192.png', self.location.origin).href;

  if (event.data) {
    try {
      const payload = event.data.json();
      const n = payload.notification || {};
      const d = payload.data || {};

      title = n.title || d.title || title;
      body = n.body || d.body || body;
      bookId = d.bookId || '';

      const rawNotifId = d.notifId || d.id || d.timestamp || '';
      if (rawNotifId) {
        tag = 'bh-' + String(rawNotifId).replace(/[^a-zA-Z0-9_-]/g, '_');
      } else {
        tag = 'bh-' + (title + '_' + body).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      }

      url = d.url || (payload.fcmOptions && payload.fcmOptions.link) || url;

      if (n.icon) {
        try { iconUrl = new URL(n.icon, self.location.origin).href; } catch (_) {}
      }
    } catch (e) {
      const text = event.data.text();
      if (text) {
        body = text;
        tag = 'bh-text-' + text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      }
    }
  }

  if (!tag) {
    tag = 'bh-alert-' + (title + '_' + body).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  }

  // Prevent multiple notifications for the same alert
  if (isDuplicatePush(tag)) {
    return;
  }

  let fullTargetUrl;
  try {
    fullTargetUrl = new URL(url, self.location.origin).href;
  } catch (e) {
    fullTargetUrl = self.location.origin + '/#profile';
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: iconUrl,
      badge: badgeUrl,
      requireInteraction: true,
      renotify: false,
      tag: tag,
      vibrate: [350, 100, 450, 100, 500, 100, 500],
      sound: 'default',
      data: {
        url: fullTargetUrl,
        bookId: bookId,
        tag: tag
      }
    })
  );
});

// Click notification handler: always focus/open the app page directly
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './#profile';
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl, self.location.origin).href;
  } catch (e) {
    targetUrl = self.location.origin + '/#profile';
  }

  const bookId = (event.notification.data && event.notification.data.bookId) || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. If an existing app window is open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.postMessage) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              url: targetUrl,
              bookId: bookId
            });
          }
          if ('navigate' in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      // 2. If no window is open, open a new window at the target URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
