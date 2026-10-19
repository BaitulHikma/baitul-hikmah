const CACHE_NAME = 'baitul-hikmah-v19';
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

// Dedicated In-Memory Debounce Set to guarantee exactly ONE notification per event
const recentPushTags = new Map();

function isDuplicatePush(tag) {
  if (!tag) return false;
  const now = Date.now();
  // Purge entries older than 15 seconds
  for (const [key, timestamp] of recentPushTags.entries()) {
    if (now - timestamp > 15000) recentPushTags.delete(key);
  }
  if (recentPushTags.has(tag)) {
    return true; // Suppress duplicate push event!
  }
  recentPushTags.set(tag, now);
  return false;
}

// SINGLE AUTHORITATIVE BACKGROUND PUSH LISTENER
// Pure W3C Push API implementation without Firebase SW SDK conflict
// Guarantees:
// 1. Exactly ONE notification shown on the lock screen / notification shade
// 2. High priority alarm sound & long vibration pattern for phone attention
// 3. Proper data payload passing for click handling
self.addEventListener('push', (event) => {
  let title = 'Baitul Hikmah 🔔';
  let body = 'You have a new update.';
  let tag = '';
  let bookId = '';
  let hash = '#profile';
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
      hash = d.hash || (bookId ? ('#explore?book=' + encodeURIComponent(bookId)) : '#profile');

      // Use the raw notifId directly as tag to maintain strict 1:1 match with server
      const rawNotifId = d.notifId || d.id || n.tag || d.timestamp || '';
      if (rawNotifId) {
        tag = String(rawNotifId).replace(/[^a-zA-Z0-9_-]/g, '_');
      } else {
        tag = 'bh_' + (title + '_' + body).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      }

      if (n.icon) {
        try { iconUrl = new URL(n.icon, self.location.origin).href; } catch (_) {}
      }
    } catch (e) {
      const text = event.data.text();
      if (text) {
        body = text;
        tag = 'bh_text_' + text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      }
    }
  }

  if (!tag) {
    tag = 'bh_alert_' + (title + '_' + body).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  }

  // Prevent duplicate notifications from multiple push events
  if (isDuplicatePush(tag)) {
    return;
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
        hash: hash,
        bookId: bookId,
        tag: tag
      }
    })
  );
});

// NOTIFICATION CLICK HANDLER: DIRECTLY OPENS THE INSTALLED PHONE APP (NOT CHROME OR AI STUDIO)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const bookId = data.bookId || '';
  const hash = data.hash || (bookId ? ('#explore?book=' + encodeURIComponent(bookId)) : '#profile');

  // Strict scope resolution: always within the installed PWA scope on user's device
  const appScope = self.registration.scope || (self.location.origin + '/');
  let targetUrl = appScope;
  try {
    targetUrl = new URL(hash, appScope).href;
  } catch (e) {
    targetUrl = appScope + '#profile';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. If an app window/PWA is already open (in foreground or background), focus it!
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.postMessage) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              url: targetUrl,
              hash: hash,
              bookId: bookId
            });
          }
          if ('navigate' in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }

      // 2. If app is completely closed:
      // Open targetUrl within self.registration.scope.
      // In Android WebAPK and iOS Home Screen PWA, opening an URL inside scope opens the INSTALLED PHONE APP!
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
