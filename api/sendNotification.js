const admin = require('firebase-admin');

// 1. ADIMDA İNDİRDİĞİN JSON DOSYASINDAKİ BİLGİLERİ BURAYA YAPIŞTIR
const SERVICE_ACCOUNT = {
  projectId: "halisaha-app-10dff",
  clientEmail: "firebase-adminsdk-fbsvc@halisaha-app-10dff.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDkYr5pFlqIC682\nI9j0RA3oAw5MBNKVksIF6txQtHNsP/BH0ePg9qEKKa8JHCvMcyaUDZgT76w8lrAx\nDS5VTKJc4DpSpHoyZkO3VXuw8V/tH5qW/YGZIIfYMbEzIA4nvFAjQoepdeq1uI1d\nZbg8LaDTG8NOf0CUSzPJtfPxxXSKVttAcpX1CPPY/BlfgYp19pU1Vz30Kky7g7ck\nNmzGWc2MFPhAriXK6xgyGzXPw2+NDiCASenbwEfo/9l7gZ24n7UtAGWlNEFjSYMJ\ndRWhpn9NytZOXU80oq4aSIkXhIy/CJu2Qj2Is3ymX09YwbKw80v9waLgYtACtdl6\nm8vbvPKNAgMBAAECggEABjUo4nJZGO7jCaBaep6Jl499s/3tkLiMeDIKCvzcpknr\n810hHzGU7vxzECxT2cVyJv63mNMgO1qyhKLMakUgT1CeRTYd8YDAwRrxtxLYffl9\n74dfHmpj8YcS6fDVHFS3WOirXKUihriddGHEwDNSoRUAGgIbdJcWsUTg0ebWuWvV\nzsSq+dQooED2ySShEbqUVuQoHjPC3uUoWVWCQ3pg8LbLkh6oZREHqYG3+1on2Hi5\nAmo3Ljfc+ale6GrIJAmKZ7d7UrB5yYMjjngy5RQsktLY8sFBFMA10/vcwmMzPna/\n6YxEhuksLQNyIV+nZAnqofsuIc+++9fqZXo3YrAIAQKBgQD2nUr3ivBNNK1Px8ub\nGojq704Ab9pZ3HZlr52dJ7d+UdrHZplx4u4nJqWwQmdmEGG70JEr4VEncxp7pTOM\nBnQpugNCaztiCKqqH5+pZNufM5osJyd7uyxzvhJcI+bAwThfRLH2cNO6yyB/lVW8\nR2YJ57l6QLCBj0hm6xFzi8vjMQKBgQDtE9pWlSSPx7hQkjzmAyS+wb/NRg3g3F2F\nyr/EXTNNoh8hxjc3NAv5fp0p/0GEgrk13T8HHRACWWQij+4uOZfXJhIpbe3hwDxk\n8hu938zv9XuenhRRFBpDuLYRnD62So6NpXdCzdt7OArQmorlBPTsEJkBMynC0j6Q\nD6TbDn4WHQKBgQD1Fi8Jwke8wsw2zF25oG5P5VGEt6Stx57WwegG5hDC9kBSCNIY\nT6nUuODTQbsWwNMQX1/W1w7bANZh6TVIRKWvTlCs8nrKm8hYWCNJqpVlK1hd5u+j\nVMoBoPUIIxnRmHUYoOGoBEs3iWWbxeK1wdNTpro7GA0SRT50IctvJJCVEQKBgEgI\n1TmjnXVWgOlyVbCp2dtgMXAkzgi5zGzfmv8GNpVrIjx35sUOOmk3kHd3SKgDtFTq\ngcEekoO0N5nM09kVxM4pkjEmZrZGW9NsQQOjYbizhTk/3Pp5ujVDhYa6S8/FvaTK\nVv9kX0EEWTzjCDroE6c6r9LOgezhRwMszbGFqMf9AoGBAIvOH4BW4TQnht+furQY\nGHqI3F6Lz1AicGg91Zg726R5SzyMayH0E32RcYEwFe9ZhYxcEiLU5XFMUYHwPTaL\nmiiX0cLErHrILRpMiYyFQclMwHlb8TkTvsCug92YBCK6V69543x3YAi7JIW6yPOU\nNTkLpt8mm5JwPgnhtDTQ7g1Q\n-----END PRIVATE KEY-----\n"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: SERVICE_ACCOUNT.projectId,
      clientEmail: SERVICE_ACCOUNT.clientEmail,
      // Private key içindeki \n kaçış karakterlerini gerçek alt satıra çeviriyoruz
      privateKey: SERVICE_ACCOUNT.privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

module.exports = async (req, res) => {
  // Tarayıcı güvenlik (CORS) ayarları
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST metodu desteklenir.' });
  }

  try {
    const { title, body, tokens } = req.body;

    if (!tokens || tokens.length === 0) {
      return res.status(200).json({ message: 'Gönderilecek cihaz (FCM token) bulunamadı.' });
    }

    // Firebase'e bildirimi fırlat komutu
    const message = {
      notification: { title, body },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    return res.status(200).json({ success: true, response });

  } catch (error) {
    console.error('Push Bildirim hatası:', error);
    return res.status(500).json({ error: 'Bildirim gönderilemedi', details: error.message });
  }
};
