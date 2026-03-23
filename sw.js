// Mounjaro Tracker – Service Worker

self.addEventListener('message', event => {
  const data = event.data;
  if (data && data.type === 'SHOW_NOTIFICATION') {
    const options = {
      body: data.body,
      tag: data.tag,
      icon: '/icon.png',
      badge: '/icon.png',
      actions: data.actions || [],
      data: { tag: data.tag }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action;

  let targetUrl = './';
  if (action === 'record-weight') targetUrl = './?tab=weight';
  else if (action === 'record-inj')   targetUrl = './?tab=injection';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('navigate' in client) {
          return client.navigate(targetUrl).then(c => c && c.focus ? c.focus() : null);
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));
