/**
 * 新着動画公開時のWeb Push通知(#157)用のService Worker。
 * このサイトは完全静的なコンテンツサイトのため、オフラインキャッシュ等は行わず
 * fetch イベントにも介入しない(通常のナビゲーションは常にネットワークから配信される)。
 * 役割はPush通知の受信表示とクリック時の遷移のみに限定する。
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // JSON以外のペイロードは想定していないため無視する
    return;
  }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "MayaBase";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: typeof payload.url === "string" && payload.url ? payload.url : "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
