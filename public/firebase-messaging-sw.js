importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC1fxFGB3JfH839cAW0MN_hvNtP5aS756c",
  authDomain: "halisaha-app-10dff.firebaseapp.com",
  projectId: "halisaha-app-10dff",
  storageBucket: "halisaha-app-10dff.firebasestorage.app",
  messagingSenderId: "294383393411",
  appId: "1:294383393411:web:056c1d57a46376072f99b6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Arka plan bildirimi alındı: ', payload);
  
  const notificationTitle = payload.notification?.title || 'Şampiyonlar Arenası';
  const notificationOptions = {
    body: payload.notification?.body || 'Yeni bir bildiriminiz var.',
    icon: '/vite.svg', // Varsa projenizin kendi logo ismini (örn: logo.png) yazabilirsiniz.
    badge: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
