importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Projenin Firebase Config bilgileri
firebase.initializeApp({
  apiKey: "AIzaSyC1fxFGB3JfH839cAW0MN_hvNtP5aS756c",
  authDomain: "halisaha-app-10dff.firebaseapp.com",
  projectId: "halisaha-app-10dff",
  storageBucket: "halisaha-app-10dff.firebasestorage.app",
  messagingSenderId: "294383393411",
  appId: "1:294383393411:web:056c1d57a46376072f99b6",
  measurementId: "G-4F47KCSD7Y"
});

const messaging = firebase.messaging();

// Arka planda bildirim gelince telefonu uyandıracak kod
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Arka plan bildirimi alındı: ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg', // Varsa kendi projenin logo ismini yazabilirsin
    badge: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
```

---

### Adım 3: Vercel Sunucu API'sini (Backend) Kurmak
React sadece ön yüzdür. Orijinal bildirim fişeğini Vercel'in gizli sunucusu üzerinden ateşleyeceğiz.

1. VS Code'da terminali aç ve şu komutu yazarak Firebase yetkili paketini yükle:
   ```bash
   npm install firebase-admin
