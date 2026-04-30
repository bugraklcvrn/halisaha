import React, { useState, useEffect } from 'react';
import { Users, LayoutTemplate, CalendarDays, Trophy, Trash2, Plus, Save, Play, Star, Goal, Edit, ShieldCheck, UserCheck, ShieldAlert, Shield, LogOut, KeyRound } from 'lucide-react';

// --- FIREBASE BAĞLANTISI (Vercel'e yüklerken kendi ayarlarınızı gireceksiniz) ---
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC1fxFGB3JfH839cAW0MN_hvNtP5aS756c",
  authDomain: "halisaha-app-10dff.firebaseapp.com",
  projectId: "halisaha-app-10dff",
  storageBucket: "halisaha-app-10dff.firebasestorage.app",
  messagingSenderId: "294383393411",
  appId: "1:294383393411:web:056c1d57a46376072f99b6",
  measurementId: "G-4F47KCSD7Y"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'halisaha-canli';

// Tüm ortak verilerin yolu
const dbPath = (colName) => collection(db, 'artifacts', appId, 'public', 'data', colName);

// --- YARDIMCI FONKSİYONLAR ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const generatePlayerId = () => Math.floor(100000 + Math.random() * 900000).toString(); // 6 Haneli ID

const THEME = {
  bg: 'bg-slate-900',
  panel: 'bg-slate-800',
  text: 'text-slate-200',
  primary: 'bg-blue-600 hover:bg-blue-500',
  accent: 'text-cyan-400',
  border: 'border-slate-700',
  pitch: 'bg-gradient-to-b from-green-800 to-green-900',
};

// --- ANA BİLEŞEN ---
export default function App() {
  const [activeTab, setActiveTab] = useState('oyuncular');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Uygulama İçi Kullanıcı Oturumu (ID ile)
  const [appUserId, setAppUserId] = useState(localStorage.getItem('halisaha_userId') || null);
  
  // Veritabanı State'leri
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);

  // 1. Kimlik Doğrulama (Firebase Auth) - Veritabanına erişim yetkisi için
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Giriş hatası:", err);
      }
    };
    initAuth();

    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Veritabanını Dinleme
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubPlayers = onSnapshot(dbPath('players'), 
      (snap) => setPlayers(snap.docs.map(d => ({id: d.id, ...d.data()}))),
      (err) => console.error("Oyuncular yüklenemedi:", err)
    );

    const unsubMatches = onSnapshot(dbPath('matches'), 
      (snap) => setMatches(snap.docs.map(d => ({id: d.id, ...d.data()}))),
      (err) => console.error("Maçlar yüklenemedi:", err)
    );

    return () => { unsubPlayers(); unsubMatches(); };
  }, [firebaseUser]);

  // Ekran Yükleniyor...
  if (authLoading) {
    return <div className={`min-h-screen ${THEME.bg} flex items-center justify-center text-cyan-400`}><Star className="animate-spin w-12 h-12" /></div>;
  }

  // --- KULLANICI ROL KONTROLLERİ ---
  const currentUserData = players.find(p => p.id === appUserId);
  const isMasterAdmin = currentUserData?.role === 'master_admin';
  const isAdmin = isMasterAdmin || currentUserData?.role === 'admin';
  
  // Üye kaydı yoksa veya silinmişse Kayıt/Giriş Ekranı
  if (!appUserId || !currentUserData) {
    // Eğer localStorage'da ID varsa ama veritabanında yoksa (silinmişse), local'i temizle
    if (appUserId && players.length > 0) {
      localStorage.removeItem('halisaha_userId');
      setAppUserId(null);
    }
    return <AuthScreen setAppUserId={setAppUserId} players={players} />;
  }

  // Üye kaydı var ama onay bekliyorsa
  if (currentUserData?.status === 'pending') {
    return (
      <div className={`min-h-screen ${THEME.bg} ${THEME.text} flex flex-col items-center justify-center p-6 text-center`}>
        <ShieldAlert size={64} className="text-yellow-500 mb-6 animate-pulse" />
        <h1 className="text-3xl font-black mb-4">Onay Bekleniyor</h1>
        <p className="text-slate-400 max-w-md mb-6">
          Hesabın başarıyla oluşturuldu. Ancak uygulamaya erişmek için adminin onay vermesi gerekiyor. Lütfen daha sonra tekrar kontrol et.
        </p>
        <button onClick={() => {localStorage.removeItem('halisaha_userId'); setAppUserId(null);}} className="text-sm text-red-400 border border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-500/10">
          Farklı Bir Hesaba Geç
        </button>
      </div>
    );
  }

  // Çıkış Yapma Fonksiyonu
  const handleLogout = () => {
    localStorage.removeItem('halisaha_userId');
    setAppUserId(null);
  };

  // --- SEKME YÖNETİMİ ---
  const renderTabContent = () => {
    switch (activeTab) {
      case 'oyuncular': return <PlayersTab players={players} currentUserData={currentUserData} isAdmin={isAdmin} isMasterAdmin={isMasterAdmin} />;
      case 'kadro': return isAdmin ? <SquadTab players={players} matches={matches} /> : null;
      case 'fikstur': return <FixturesTab matches={matches} players={players} currentUserData={currentUserData} isAdmin={isAdmin} />;
      case 'istatistik': return <StatsTab players={players} matches={matches} />;
      default: return null;
    }
  };

  return (
    <div className={`min-h-screen ${THEME.bg} ${THEME.text} font-sans`}>
      {/* HEADER / NAVBAR */}
      <header className="bg-slate-950 border-b border-blue-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between py-4">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                <Star className="text-white w-6 h-6" fill="currentColor" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-200 uppercase leading-none">
                  Champions
                </h1>
                <span className="text-xs tracking-widest text-slate-400 font-bold">ARENA</span>
              </div>
            </div>
            
            <nav className="flex flex-wrap justify-center gap-2 flex-1 md:px-8 mb-4 md:mb-0">
              <NavButton active={activeTab === 'oyuncular'} onClick={() => setActiveTab('oyuncular')} icon={<Users size={18} />} text="Oyuncular" />
              {isAdmin && <NavButton active={activeTab === 'kadro'} onClick={() => setActiveTab('kadro')} icon={<LayoutTemplate size={18} />} text="Kadro Kur" />}
              <NavButton active={activeTab === 'fikstur'} onClick={() => setActiveTab('fikstur')} icon={<CalendarDays size={18} />} text="Fikstür" />
              <NavButton active={activeTab === 'istatistik'} onClick={() => setActiveTab('istatistik')} icon={<Trophy size={18} />} text="İstatistikler" />
            </nav>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold text-white">{currentUserData.firstName} {currentUserData.lastName}</div>
                <div className="text-[10px] text-cyan-400 font-mono">ID: {currentUserData.id}</div>
              </div>
              <button onClick={handleLogout} className="bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-colors border border-red-500/30" title="Çıkış Yap">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* İÇERİK ALANI */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {renderTabContent()}
      </main>
    </div>
  );
}

const NavButton = ({ active, onClick, icon, text }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300
      ${active 
        ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.6)]' 
        : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
  >
    {icon} {text}
  </button>
);


// ==========================================
// 0. GİRİŞ YAP VE KAYIT OL EKRANI
// ==========================================
function AuthScreen({ setAppUserId, players }) {
  const [isLogin, setIsLogin] = useState(true);
  const [notification, setNotification] = useState(null);

  // Login Form
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Register Form
  const [regData, setRegData] = useState({
    firstName: '', lastName: '', phone: '', group: '', position: 'Forvet', number: '', password: ''
  });

  const usedNumbers = players.map(p => Number(p.number));
  const availableNumbers = Array.from({length: 99}, (_, i) => i + 1);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginId || !loginPass) return;

    const user = players.find(p => p.id === loginId && p.password === loginPass);
    if (user) {
      localStorage.setItem('halisaha_userId', user.id);
      setAppUserId(user.id);
    } else {
      setNotification("ID veya Şifre hatalı!");
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regData.firstName || !regData.number || !regData.position || !regData.password) return;
    
    // Sistemdeki ilk kayıt olan kişi otomatik Asıl Admin olur
    const isFirstUser = players.length === 0;

    let newId;
    do {
      newId = generatePlayerId();
    } while (players.some(p => p.id === newId)); // ID çakışmasını engelle

    const newUserDoc = {
      ...regData,
      id: newId,
      role: isFirstUser ? 'master_admin' : 'user',
      status: isFirstUser ? 'approved' : 'pending',
      isActive: true,
      registeredAt: Date.now()
    };

    await setDoc(doc(dbPath('players'), newId), newUserDoc);
    
    // Kayıt sonrası otomatik o hesaba geç
    localStorage.setItem('halisaha_userId', newId);
    setAppUserId(newId);
  };

  return (
    <div className={`min-h-screen ${THEME.bg} ${THEME.text} flex items-center justify-center p-4`}>
      <div className={`${THEME.panel} p-8 rounded-2xl border ${THEME.border} max-w-md w-full shadow-2xl`}>
        <div className="text-center mb-8">
           <div className="w-16 h-16 mx-auto rounded-full bg-blue-900 flex items-center justify-center border-2 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)] mb-4">
             <Trophy className="text-white w-8 h-8" />
           </div>
           <h2 className="text-2xl font-black">Champions Arena</h2>
        </div>

        {/* Tab Seçimi */}
        <div className="flex rounded-lg bg-slate-900 p-1 mb-6 border border-slate-700">
          <button onClick={() => setIsLogin(true)} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${isLogin ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
            Giriş Yap
          </button>
          <button onClick={() => setIsLogin(false)} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!isLogin ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
            Kayıt Ol
          </button>
        </div>

        {notification && (
          <div className="bg-red-900/50 text-red-400 p-3 rounded-lg text-sm text-center mb-4 border border-red-500/50">
            {notification}
          </div>
        )}

        {isLogin ? (
          /* GİRİŞ FORMU */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hesap ID (6 Haneli)</label>
              <input required type="text" maxLength="6" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-cyan-400 font-mono tracking-widest text-center text-lg" 
                value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="000000" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Şifre</label>
              <input required type="password" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-cyan-400" 
                value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••" />
            </div>
            <button type="submit" className="w-full mt-2 py-3 rounded-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg transition-all flex justify-center items-center gap-2">
              <KeyRound size={18} /> Sisteme Giriş
            </button>
          </form>
        ) : (
          /* KAYIT FORMU */
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ad <span className="text-red-500">*</span></label>
                <input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                  value={regData.firstName} onChange={e => setRegData({...regData, firstName: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Soyad</label>
                <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                  value={regData.lastName} onChange={e => setRegData({...regData, lastName: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Forma No <span className="text-red-500">*</span></label>
                <select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                  value={regData.number} onChange={e => setRegData({...regData, number: e.target.value})}>
                  <option value="">Seç...</option>
                  {availableNumbers.map(num => (
                    <option key={num} value={num} disabled={usedNumbers.includes(num)}>
                      {num} {usedNumbers.includes(num) ? '(Dolu)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Pozisyon <span className="text-red-500">*</span></label>
                <select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400"
                  value={regData.position} onChange={e => setRegData({...regData, position: e.target.value})}>
                  <option>Kaleci</option><option>Defans</option><option>Orta Saha</option><option>Forvet</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Telefon No</label>
                <input type="tel" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                  value={regData.phone} onChange={e => setRegData({...regData, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ekip/Grup</label>
                <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                  value={regData.group} onChange={e => setRegData({...regData, group: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Şifre Belirle <span className="text-red-500">*</span></label>
              <input required type="password" placeholder="Hesabın için bir şifre gir" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} />
            </div>
            <button type="submit" className={`w-full mt-4 py-3 rounded-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg transition-all`}>
              Üye Ol ve Onaya Gönder
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 1. OYUNCU YÖNETİMİ SEKRESİ
// ==========================================
function PlayersTab({ players, currentUserData, isAdmin, isMasterAdmin }) {
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', phone: '', group: '', position: 'Forvet', number: '', password: ''
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);

  const pendingPlayers = players.filter(p => p.status === 'pending');
  const approvedPlayers = players.filter(p => p.status === 'approved');

  const usedNumbers = players.map(p => Number(p.number));
  const availableNumbers = Array.from({length: 99}, (_, i) => i + 1);

  // Admin manuel olarak havuzdan eklerse
  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!formData.firstName || !formData.number || !formData.position || !formData.password) return;
    
    let newId;
    do { newId = generatePlayerId(); } while (players.some(p => p.id === newId));

    await setDoc(doc(dbPath('players'), newId), { 
      ...formData, id: newId, status: 'approved', role: 'user', isActive: true 
    });
    setFormData({ firstName: '', lastName: '', phone: '', group: '', position: 'Forvet', number: '', password: '' });
  };

  const togglePlayerStatus = async (id, currentStatus) => {
    await updateDoc(doc(dbPath('players'), id), { isActive: !currentStatus });
  };

  const confirmDelete = async (id) => {
    await deleteDoc(doc(dbPath('players'), id));
    setDeleteConfirmId(null);
  };

  const saveEdit = async () => {
    if (!editingPlayer.firstName || !editingPlayer.number || !editingPlayer.position) return;
    await updateDoc(doc(dbPath('players'), editingPlayer.id), editingPlayer);
    setEditingPlayer(null);
  };

  const approveUser = async (id) => {
    await updateDoc(doc(dbPath('players'), id), { status: 'approved' });
  };

  const grantAdmin = async (id) => {
    await updateDoc(doc(dbPath('players'), id), { role: 'admin' });
  };

  const revokeAdmin = async (id) => {
    await updateDoc(doc(dbPath('players'), id), { role: 'user' });
  };

  return (
    <div className="space-y-8">
      {/* Kullanıcı Kendi Profil ve ID'si */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 p-6 rounded-xl flex flex-col md:flex-row items-center gap-6 shadow-lg">
        <div className="w-16 h-16 rounded-full bg-blue-900/50 flex items-center justify-center border-2 border-cyan-500">
          <span className="text-2xl font-black text-cyan-400">{currentUserData.number}</span>
        </div>
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-2xl font-bold text-white">{currentUserData.firstName} {currentUserData.lastName} <span className="text-sm font-normal text-slate-400">({currentUserData.position})</span></h2>
          <p className="text-slate-400 text-sm mt-1">Bu ID ve kayıt olurken belirlediğin şifren ile başka bir cihazdan giriş yapabilirsin.</p>
        </div>
        <div className="bg-slate-950 p-4 rounded-lg border border-cyan-500/30 text-center min-w-[150px]">
          <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold mb-1">Hesap ID</div>
          <div className="text-2xl font-mono font-black text-white tracking-widest">{currentUserData.id}</div>
        </div>
      </div>

      {/* Admin Başlığı */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-blue-900/40 to-cyan-900/10 border border-blue-500/30 p-4 rounded-xl flex items-center gap-3">
          {isMasterAdmin ? <ShieldCheck className="text-yellow-400" size={28} /> : <Shield className="text-cyan-400" size={28} />}
          <div>
            <h2 className="font-bold text-lg text-white">
              {isMasterAdmin ? 'Asıl Admin Modu Aktif' : 'Admin Modu Aktif'}
            </h2>
            <p className="text-xs text-slate-400">Sistemdeki tüm yetkilere sahipsiniz ve tüm hesap ID'lerini görebilirsiniz.</p>
          </div>
        </div>
      )}

      {/* Bekleyen Onaylar (Sadece Adminler Görür) */}
      {isAdmin && pendingPlayers.length > 0 && (
        <div className={`${THEME.panel} p-6 rounded-xl border border-yellow-500/30 shadow-lg`}>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-yellow-400">
            <UserCheck /> Onay Bekleyen Üyeler ({pendingPlayers.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingPlayers.map(p => (
              <div key={p.id} className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">{p.firstName} {p.lastName}</div>
                  <div className="text-xs text-slate-400">Forma: {p.number} | Poz: {p.position}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveUser(p.id)} className="bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white px-3 py-1.5 rounded font-bold text-xs transition-colors">Onayla</button>
                  <button onClick={() => confirmDelete(p.id)} className="bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded font-bold text-xs transition-colors">Reddet</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Oyuncu Ekleme Formu (Sadece Admin) */}
        {isAdmin && (
          <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border} lg:col-span-1 h-fit`}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b border-slate-700 pb-3">
              <Plus className={THEME.accent} /> Manuel Oyuncu Ekle
            </h2>
            <form onSubmit={handleManualAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ad <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                    value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Soyad</label>
                  <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                    value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Forma No <span className="text-red-500">*</span></label>
                  <select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                    value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})}>
                    <option value="">Seç...</option>
                    {availableNumbers.map(num => (
                      <option key={num} value={num} disabled={usedNumbers.includes(num)}>
                        {num} {usedNumbers.includes(num) ? '(Dolu)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Pozisyon <span className="text-red-500">*</span></label>
                  <select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400"
                    value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})}>
                    <option>Kaleci</option><option>Defans</option><option>Orta Saha</option><option>Forvet</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Geçici Şifre Ataması <span className="text-red-500">*</span></label>
                <input required type="text" placeholder="Oyuncu için şifre girin" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
                  value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
              <button type="submit" className={`w-full mt-4 py-2 rounded font-bold ${THEME.primary} transition-colors`}>
                Kayıtlı Oyuncu Olarak Ekle
              </button>
            </form>
          </div>
        )}

        {/* Oyuncu Havuzu Listesi (Herkes Görür, Admin Düzenler) */}
        <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border} ${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b border-slate-700 pb-3">
            <Users className={THEME.accent} /> Oyuncu Havuzu ({approvedPlayers.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-3 rounded-tl-lg w-12 text-center">No</th>
                  <th className="p-3">Ad Soyad</th>
                  <th className="p-3">Pozisyon</th>
                  {isAdmin && <th className="p-3 text-center">Durum / Rol</th>}
                  {isAdmin && <th className="p-3 rounded-tr-lg text-center">İşlem</th>}
                </tr>
              </thead>
              <tbody>
                {approvedPlayers.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 5 : 3} className="p-4 text-center text-slate-500">Kayıtlı onaylı oyuncu yok.</td></tr>
                ) : (
                  approvedPlayers.map((p) => {
                    // Düzenleme Modu (Sadece Admin)
                    if (isAdmin && editingPlayer?.id === p.id) {
                      return (
                        <tr key={`edit-${p.id}`} className="border-b border-slate-700 bg-slate-800">
                          <td className="p-2 align-top text-center">
                            <input type="number" className="w-12 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none text-center" value={editingPlayer.number} onChange={e => setEditingPlayer({...editingPlayer, number: e.target.value})} />
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <input type="text" placeholder="Ad" className="w-1/2 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none" value={editingPlayer.firstName} onChange={e => setEditingPlayer({...editingPlayer, firstName: e.target.value})} />
                              <input type="text" placeholder="Soyad" className="w-1/2 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none" value={editingPlayer.lastName} onChange={e => setEditingPlayer({...editingPlayer, lastName: e.target.value})} />
                            </div>
                          </td>
                          <td className="p-2 align-top">
                            <select className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none" value={editingPlayer.position} onChange={e => setEditingPlayer({...editingPlayer, position: e.target.value})}>
                              <option>Kaleci</option><option>Defans</option><option>Orta Saha</option><option>Forvet</option>
                            </select>
                          </td>
                          <td colSpan="2" className="p-2 text-center align-top">
                             <div className="flex gap-2 justify-center mt-1">
                                <button onClick={saveEdit} className="text-green-400 hover:text-green-300 font-bold text-xs bg-green-900/40 px-3 py-1.5 rounded border border-green-700">Kaydet</button>
                                <button onClick={() => setEditingPlayer(null)} className="text-slate-400 hover:text-slate-300 font-bold text-xs bg-slate-700/80 px-3 py-1.5 rounded border border-slate-600">İptal</button>
                             </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={p.id} className={`border-b border-slate-700 transition-colors ${p.isActive === false ? 'opacity-50 bg-slate-800' : 'hover:bg-slate-700/50'}`}>
                        <td className="p-3 font-mono text-cyan-400 text-center font-bold text-lg">{p.number || '-'}</td>
                        <td className="p-3">
                           <div className="font-semibold text-white flex items-center gap-2">
                             {p.firstName} {p.lastName}
                             {p.role === 'master_admin' && <ShieldCheck size={14} className="text-yellow-400" title="Asıl Admin" />}
                             {p.role === 'admin' && <Shield size={14} className="text-cyan-400" title="Admin" />}
                           </div>
                           {/* ADMIN BÜTÜN ID'LERİ GÖRÜR */}
                           {isAdmin ? (
                             <div className="text-[10px] text-slate-500 font-mono tracking-widest">ID: <span className="text-cyan-500 font-bold">{p.id}</span></div>
                           ) : (
                             <div className="text-[10px] text-slate-500">{p.group || '...'}</div>
                           )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs
                            ${p.position === 'Kaleci' ? 'bg-yellow-600/20 text-yellow-400' : 
                              p.position === 'Defans' ? 'bg-blue-600/20 text-blue-400' : 
                              p.position === 'Orta Saha' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                            {p.position}
                          </span>
                        </td>
                        
                        {/* Admin Kontrolleri */}
                        {isAdmin && (
                          <td className="p-3 text-center">
                            <button
                              onClick={() => togglePlayerStatus(p.id, p.isActive !== false)}
                              disabled={p.role === 'master_admin'} // Asıl admin pasif yapılamaz
                              className={`px-3 py-1 rounded text-xs font-bold transition-all ${p.isActive !== false ? 'bg-green-600/20 text-green-400 border border-green-500/50 hover:bg-green-600/40' : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'} disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              {p.isActive !== false ? 'Aktif' : 'Pasif'}
                            </button>
                          </td>
                        )}
                        {isAdmin && (
                          <td className="p-3">
                            <div className="flex flex-col gap-2 items-center">
                              {/* Silme İşlemi */}
                              {deleteConfirmId === p.id ? (
                                <div className="flex gap-1 justify-center">
                                  <button onClick={() => confirmDelete(p.id)} className="text-red-400 hover:text-white font-bold text-[10px] bg-red-900/60 px-2 py-1 rounded">Onayla</button>
                                  <button onClick={() => setDeleteConfirmId(null)} className="text-slate-300 hover:text-white font-bold text-[10px] bg-slate-700 px-2 py-1 rounded">İptal</button>
                                </div>
                              ) : (
                                <div className="flex gap-2 justify-center items-center">
                                  <button onClick={() => setEditingPlayer(p)} disabled={p.role === 'master_admin' && !isMasterAdmin} className="text-blue-400 hover:text-blue-300 p-1.5 bg-blue-900/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Düzenle">
                                    <Edit size={14} />
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(p.id)} disabled={p.role === 'master_admin' || (p.role === 'admin' && !isMasterAdmin)} className="text-red-400 hover:text-red-300 p-1.5 bg-red-900/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Sil">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}

                              {/* Adminlik Verme / Alma */}
                              {p.role === 'user' && (
                                <button onClick={() => grantAdmin(p.id)} className="text-[10px] text-cyan-400 border border-cyan-700/50 bg-cyan-900/20 px-2 py-0.5 rounded hover:bg-cyan-800/40 w-full">
                                  Admin Yap
                                </button>
                              )}
                              {p.role === 'admin' && isMasterAdmin && (
                                <button onClick={() => revokeAdmin(p.id)} className="text-[10px] text-orange-400 border border-orange-700/50 bg-orange-900/20 px-2 py-0.5 rounded hover:bg-orange-800/40 w-full">
                                  Yetkiyi Al
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. KADRO KURMA SEKRESİ (Sadece Adminler)
// ==========================================
function SquadTab({ players, matches }) {
  const [matchData, setMatchData] = useState({ date: '', time: '', teamAName: 'Ev Sahibi', teamBName: 'Deplasman' });
  const [pitchPlayers, setPitchPlayers] = useState([]);
  const [substitutes, setSubstitutes] = useState([]);
  const [notification, setNotification] = useState(null);

  const handleDragStart = (e, playerId, source) => {
    e.dataTransfer.setData('playerId', playerId);
    e.dataTransfer.setData('source', source);
  };

  const handleDropOnPitch = (e, team) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData('playerId');
    if (!playerId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setPitchPlayers(prev => {
      const filtered = prev.filter(p => p.playerId !== playerId);
      return [...filtered, { playerId, x, y, team }];
    });
    setSubstitutes(prev => prev.filter(id => id !== playerId));
  };

  const handleDropOnSubs = (e) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData('playerId');
    if (!playerId) return;
    if (!substitutes.includes(playerId)) setSubstitutes([...substitutes, playerId]);
    setPitchPlayers(prev => prev.filter(p => p.playerId !== playerId));
  };

  const handleDropToRemove = (e) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData('playerId');
    if (!playerId) return;
    setPitchPlayers(prev => prev.filter(p => p.playerId !== playerId));
    setSubstitutes(prev => prev.filter(id => id !== playerId));
  };

  const updatePitchPlayerPosition = (playerId, x, y) => {
    setPitchPlayers(prev => prev.map(p => p.playerId === playerId ? { ...p, x, y, team: x <= 50 ? 'A' : 'B' } : p));
  };

  const handleDoubleClickPlayer = (playerId) => {
    const countA = pitchPlayers.filter(p => p.team === 'A').length;
    const countB = pitchPlayers.filter(p => p.team === 'B').length;
    const team = countA <= countB ? 'A' : 'B';
    const x = team === 'A' ? 25 + Math.random() * 10 : 65 + Math.random() * 10;
    const y = 20 + Math.random() * 60;
    setPitchPlayers(prev => [...prev, { playerId, x, y, team }]);
    setSubstitutes(prev => prev.filter(id => id !== playerId));
  };

  const saveMatch = async () => {
    const errors = [];
    if (!matchData.date) errors.push("Tarih");
    if (!matchData.time) errors.push("Saat");
    if (!matchData.teamAName || matchData.teamAName.trim() === '') errors.push("Takım A İsmi");
    if (!matchData.teamBName || matchData.teamBName.trim() === '') errors.push("Takım B İsmi");
    if (pitchPlayers.length === 0) errors.push("Sahaya Oyuncu");

    if (errors.length > 0) {
      setNotification({ type: 'error', text: `Lütfen eksik bilgileri girin: ${errors.join(', ')}` });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    const newMatch = {
      id: generateId(),
      ...matchData,
      teamA: pitchPlayers.filter(p => p.team === 'A'),
      teamB: pitchPlayers.filter(p => p.team === 'B'),
      subs: substitutes,
      status: 'pending',
      scoreA: 0,
      scoreB: 0,
      events: [],
      ratings: {} // { playerId: { raterUid: score } }
    };

    await setDoc(doc(dbPath('matches'), newMatch.id), newMatch);
    
    setNotification({ type: 'success', text: 'Kadro başarıyla kaydedildi! Fikstürden maçı başlatabilirsiniz.' });
    setTimeout(() => setNotification(null), 4000);
    setPitchPlayers([]);
    setSubstitutes([]);
    setMatchData({ date: '', time: '', teamAName: 'Ev Sahibi', teamBName: 'Deplasman' });
  };

  // Onaylı ve aktif oyuncular (sahada olmayanlar)
  const availablePlayers = players.filter(p => p.status === 'approved' && p.isActive !== false && !pitchPlayers.find(pp => pp.playerId === p.id) && !substitutes.includes(p.id));

  return (
    <div className="space-y-6">
      {notification && (
        <div className={`p-4 rounded-lg font-bold border shadow-lg transition-all ${notification.type === 'error' ? 'bg-red-900/50 text-red-400 border-red-500' : 'bg-green-900/50 text-green-400 border-green-500'}`}>
          {notification.text}
        </div>
      )}

      {/* Maç Bilgileri */}
      <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border}`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Maç Tarihi</label>
            <input type="date" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
              value={matchData.date} onChange={e => setMatchData({...matchData, date: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Maç Saati</label>
            <input type="time" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" 
              value={matchData.time} onChange={e => setMatchData({...matchData, time: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs text-cyan-400 mb-1">Takım A İsmi</label>
            <input type="text" className="w-full bg-blue-900/50 border border-blue-500 rounded p-2 text-white outline-none focus:border-cyan-400" 
              value={matchData.teamAName} onChange={e => setMatchData({...matchData, teamAName: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs text-pink-400 mb-1">Takım B İsmi</label>
            <input type="text" className="w-full bg-pink-900/50 border border-pink-500 rounded p-2 text-white outline-none focus:border-cyan-400" 
              value={matchData.teamBName} onChange={e => setMatchData({...matchData, teamBName: e.target.value})} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-4 flex flex-col">
          <div className={`${THEME.panel} p-4 rounded-xl border ${THEME.border} h-[340px] overflow-y-auto`}>
            <h3 className="font-bold text-sm mb-3 border-b border-slate-700 pb-2">Kullanılabilir ({availablePlayers.length})</h3>
            <p className="text-[10px] text-slate-500 mb-2 italic">Çift tıklayarak sahaya atabilirsin.</p>
            <div className="space-y-2">
              {availablePlayers.map(p => (
                <div key={p.id} draggable onDragStart={(e) => handleDragStart(e, p.id, 'pool')} onDoubleClick={() => handleDoubleClickPlayer(p.id)}
                  className="bg-slate-900 p-2 rounded border border-slate-700 cursor-grab active:cursor-grabbing hover:border-cyan-400 flex justify-between items-center text-sm transition-colors">
                  <span>{p.firstName} {p.lastName}</span>
                  <span className="text-xs text-slate-500 font-mono">#{p.number}</span>
                </div>
              ))}
            </div>
          </div>

          <div id="subs-zone" className={`${THEME.panel} p-4 rounded-xl border-2 border-dashed ${THEME.border} h-40 overflow-y-auto bg-slate-800/50`} onDragOver={e => e.preventDefault()} onDrop={handleDropOnSubs}>
            <h3 className="font-bold text-sm mb-3 text-slate-400 text-center">Yedekler (Sürükle)</h3>
            <div className="space-y-2">
              {substitutes.map(id => {
                const p = players.find(player => player.id === id);
                if(!p) return null;
                return (
                  <div key={p.id} draggable onDragStart={(e) => handleDragStart(e, p.id, 'subs')}
                    className="bg-slate-700 p-2 rounded cursor-grab flex justify-between items-center text-sm border border-yellow-600/30">
                    <span>{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-yellow-400">Yedek</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div id="trash-zone" className={`${THEME.panel} p-4 rounded-xl border-2 border-dashed border-red-500/50 bg-red-900/10 flex flex-col items-center justify-center text-red-400 h-24 transition-colors hover:bg-red-900/30`} onDragOver={e => e.preventDefault()} onDrop={handleDropToRemove}>
            <Trash2 size={24} className="mb-1 opacity-80" />
            <span className="text-sm font-bold">Kadrodan Çıkar</span>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 shadow-2xl relative">
            <div className="pitch-container relative w-full aspect-[4/3] max-h-[600px] flex overflow-hidden border-4 border-white/80 rounded" style={{background: '#1a5928'}}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, #000 10%, #000 20%)'}}></div>
              <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-white/80 -ml-[2px] z-10"></div>
              <div className="absolute left-1/2 top-1/2 w-32 h-32 border-4 border-white/80 rounded-full -ml-16 -mt-16 z-10"></div>
              <div className="absolute left-1/2 top-1/2 w-3 h-3 bg-white/80 rounded-full -ml-[6px] -mt-[6px] z-10"></div>

              <div className="w-1/2 h-full relative z-20" onDragOver={e => e.preventDefault()} onDrop={e => handleDropOnPitch(e, 'A')}>
                <div className="absolute left-0 top-1/2 -mt-24 w-32 h-48 border-4 border-l-0 border-white/80"></div>
                <div className="absolute left-0 top-1/2 -mt-10 w-12 h-20 border-4 border-l-0 border-white/80"></div>
                {pitchPlayers.filter(p => p.team === 'A').map(pp => (
                   <PitchPlayer key={pp.playerId} pp={pp} players={players} onDragStart={handleDragStart} teamColor="bg-blue-600 border-blue-300" onUpdatePosition={updatePitchPlayerPosition} onRemove={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id))}} onMoveToSubs={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id)); setSubstitutes(s => [...s, id])}} />
                ))}
              </div>

              <div className="w-1/2 h-full relative z-20" onDragOver={e => e.preventDefault()} onDrop={e => handleDropOnPitch(e, 'B')}>
                <div className="absolute right-0 top-1/2 -mt-24 w-32 h-48 border-4 border-r-0 border-white/80"></div>
                <div className="absolute right-0 top-1/2 -mt-10 w-12 h-20 border-4 border-r-0 border-white/80"></div>
                {pitchPlayers.filter(p => p.team === 'B').map(pp => (
                   <PitchPlayer key={pp.playerId} pp={pp} players={players} onDragStart={handleDragStart} teamColor="bg-pink-600 border-pink-300" onUpdatePosition={updatePitchPlayerPosition} onRemove={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id))}} onMoveToSubs={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id)); setSubstitutes(s => [...s, id])}} />
                ))}
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button onClick={saveMatch} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-8 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all transform hover:scale-105">
                <Save size={20} /> Kadroyu ve Maçı Kaydet
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PitchPlayer = ({ pp, players, onDragStart, teamColor, onUpdatePosition, onRemove, onMoveToSubs }) => {
  const p = players.find(player => player.id === pp.playerId);
  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    const pitch = e.currentTarget.closest('.pitch-container');
    if (!pitch) return;
    const rect = pitch.getBoundingClientRect();
    let x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
    let y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100));
    onUpdatePosition(pp.playerId, x, y);
  };
  const handleTouchEnd = (e) => {
    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target?.closest('#trash-zone')) onRemove(pp.playerId);
    else if (target?.closest('#subs-zone')) onMoveToSubs(pp.playerId);
  };

  if(!p) return null;
  return (
    <div draggable onDragStart={(e) => onDragStart(e, pp.playerId, `pitch${pp.team}`)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      className="absolute cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group z-30"
      style={{ left: `${pp.x}%`, top: `${pp.y}%`, touchAction: 'none' }}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg border-2 ${teamColor}`}>
        {p.number || p.firstName.charAt(0)}
      </div>
      <div className="bg-black/70 text-white text-[10px] px-1 rounded mt-1 whitespace-nowrap opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none">
        {p.firstName}
      </div>
    </div>
  );
};


// ==========================================
// 3. FİKSTÜR VE MAÇ YÖNETİMİ
// ==========================================
function FixturesTab({ matches, players, currentUserData, isAdmin }) {
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [confirmEndMatchId, setConfirmEndMatchId] = useState(null);
  
  // Maçları tarihe göre ters sıralı göster
  const sortedMatches = [...matches].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
  const selectedMatch = matches.find(m => m.id === selectedMatchId);

  const getPlayerName = (id) => {
    if (id === 'own_goal') return 'Kendi Kalesine';
    const p = players.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : 'Bilinmiyor';
  };

  // --- YETKİLİ İŞLEMLERİ (Admin) ---
  const updateMatchStatus = async (matchId, status) => {
    if (!isAdmin) return;
    await updateDoc(doc(dbPath('matches'), matchId), { status });
    if (status === 'completed') setConfirmEndMatchId(null);
  };

  const handleAddGoal = async (teamScored, scorerId, assistId) => {
    if (!isAdmin) return;
    const newEvents = [...selectedMatch.events];
    const scoreAAtTime = newEvents.filter(e => e.team === 'A').length + (teamScored === 'A' ? 1 : 0);
    const scoreBAtTime = newEvents.filter(e => e.team === 'B').length + (teamScored === 'B' ? 1 : 0);
    
    newEvents.push({ id: generateId(), type: 'goal', team: teamScored, scorerId, assistId, scoreAAtTime, scoreBAtTime });
    await updateDoc(doc(dbPath('matches'), selectedMatch.id), { events: newEvents, scoreA: scoreAAtTime, scoreB: scoreBAtTime });
  };

  // --- PUANLAMA İŞLEMLERİ (Kullanıcılar İçin Filtreli) ---
  const handleRatingChange = async (playerId, val) => {
    // Sadece aktif maçlarda puan verilebilir
    if (selectedMatch.status !== 'active') return;
    
    const numVal = Number(val);
    if (numVal < 1 || numVal > 10) return; // Geçersiz puan

    const newRatings = { ...selectedMatch.ratings };
    if (!newRatings[playerId]) newRatings[playerId] = {};
    
    newRatings[playerId][currentUserData.id] = numVal;
    await updateDoc(doc(dbPath('matches'), selectedMatch.id), { ratings: newRatings });
  };

  // Kullanıcının Hangi Takımda Olduğunu Bulma
  const myTeam = selectedMatch?.teamA.some(p => p.playerId === currentUserData.id) ? 'A' :
                 selectedMatch?.teamB.some(p => p.playerId === currentUserData.id) ? 'B' : null;

  const canRatePlayer = (playerId, playerTeamStr) => {
    if (selectedMatch?.status !== 'active') return false;
    if (myTeam === playerTeamStr) return true;
    return false; // Kendi takımında değilse veremez
  };

  // Ortalama hesaplama
  const getAverageRating = (playerId) => {
    const pRatings = selectedMatch?.ratings[playerId];
    if (!pRatings) return null;
    const vals = Object.values(pRatings);
    if (vals.length === 0) return null;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <h2 className="text-xl font-bold border-b border-slate-700 pb-2">Maçlar</h2>
        {sortedMatches.length === 0 ? <p className="text-slate-500">Kayıtlı maç yok.</p> : null}
        
        {sortedMatches.map(m => (
          <div key={m.id} onClick={() => setSelectedMatchId(m.id)}
            className={`${THEME.panel} p-4 rounded-xl border ${selectedMatch?.id === m.id ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : THEME.border} cursor-pointer hover:bg-slate-700 transition-all`}
          >
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>{m.date}</span>
              <span>{m.time}</span>
            </div>
            <div className="flex items-center justify-between font-bold">
              <span className="text-blue-400 truncate w-1/3">{m.teamAName}</span>
              <div className="bg-slate-900 px-3 py-1 rounded-full text-lg shadow-inner">
                {m.scoreA} - {m.scoreB}
              </div>
              <span className="text-pink-400 truncate w-1/3 text-right">{m.teamBName}</span>
            </div>
            <div className="mt-3 text-center text-xs">
              {m.status === 'pending' && <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">Başlamadı</span>}
              {m.status === 'active' && <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded animate-pulse">Oynanıyor</span>}
              {m.status === 'completed' && <span className="bg-slate-600/50 text-slate-300 px-2 py-1 rounded">Tamamlandı</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="lg:col-span-2">
        {selectedMatch ? (
          <div className={`${THEME.panel} p-6 rounded-xl border border-cyan-500/30 shadow-2xl`}>
            
            <div className="text-center mb-8">
              <div className="text-sm text-slate-400 mb-2">{selectedMatch.date} - {selectedMatch.time}</div>
              <div className="flex justify-center items-center gap-8 text-3xl font-black">
                <div className="text-blue-400">{selectedMatch.teamAName}</div>
                <div className="bg-slate-900 px-6 py-2 rounded-xl border border-slate-700 shadow-inner">
                  {selectedMatch.scoreA} : {selectedMatch.scoreB}
                </div>
                <div className="text-pink-400">{selectedMatch.teamBName}</div>
              </div>
              
              {/* Sadece Admin Başlatabilir */}
              {isAdmin && selectedMatch.status === 'pending' && (
                <button onClick={() => updateMatchStatus(selectedMatch.id, 'active')} 
                  className="mt-6 bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-full font-bold flex items-center justify-center gap-2 mx-auto transition-transform hover:scale-105 shadow-lg">
                  <Play size={18} /> Maçı Başlat
                </button>
              )}
            </div>

            {selectedMatch.status !== 'pending' && (
              <div className="space-y-8">
                {/* Gol Ekleme (Sadece Aktif Maçta ve Sadece Admin) */}
                {isAdmin && selectedMatch.status === 'active' && (
                  <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 shadow-inner">
                    <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Goal size={16} className="text-cyan-400"/> Gol Kaydet (Sadece Admin)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <GoalForm team="A" match={selectedMatch} players={players} onAddGoal={(s, a) => handleAddGoal('A', s, a)} />
                      <GoalForm team="B" match={selectedMatch} players={players} onAddGoal={(s, a) => handleAddGoal('B', s, a)} />
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {selectedMatch.events.length > 0 && (
                  <div className="mt-8 mb-6">
                    <h3 className="font-bold text-sm mb-6 border-b border-slate-700 pb-2 text-center text-slate-400 uppercase tracking-widest">Maç Olayları</h3>
                    <div className="relative w-full flex flex-col items-center">
                      <div className="absolute top-0 bottom-0 w-px bg-slate-600 left-1/2 transform -translate-x-1/2"></div>
                      {selectedMatch.events.map((ev, idx) => {
                        const scoreDisplay = ev.scoreAAtTime !== undefined ? `${ev.scoreAAtTime} - ${ev.scoreBAtTime}` : '? - ?';
                        return (
                          <div key={ev.id} className="w-full flex items-center justify-between mb-4 relative z-10 group hover:scale-105 transition-transform duration-200">
                            <div className={`w-1/2 pr-6 text-right ${ev.team === 'A' ? 'opacity-100' : 'opacity-0'}`}>
                              {ev.team === 'A' && (
                                <div className="flex flex-col items-end">
                                  <span className="font-bold text-blue-400 text-sm flex items-center gap-2">
                                    {getPlayerName(ev.scorerId)}
                                    {ev.assistId && <span className="text-xs text-slate-400 font-normal">(asist: {getPlayerName(ev.assistId)})</span>}
                                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-600 font-mono text-xs ml-1">[{scoreDisplay}]</span>
                                    <Goal size={16} className="text-blue-400 ml-1" />
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="absolute left-1/2 transform -translate-x-1/2 bg-slate-900 border-[3px] border-slate-500 rounded-full w-9 h-9 flex items-center justify-center text-sm font-black text-white shadow-[0_0_15px_rgba(0,0,0,0.5)] z-20">
                              {idx + 1}
                            </div>
                            <div className={`w-1/2 pl-6 text-left ${ev.team === 'B' ? 'opacity-100' : 'opacity-0'}`}>
                              {ev.team === 'B' && (
                                <div className="flex flex-col items-start">
                                  <span className="font-bold text-pink-400 text-sm flex items-center gap-2">
                                    <Goal size={16} className="text-pink-400 mr-1" />
                                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-600 font-mono text-xs mr-1">[{scoreDisplay}]</span>
                                    {getPlayerName(ev.scorerId)}
                                    {ev.assistId && <span className="text-xs text-slate-400 font-normal">(asist: {getPlayerName(ev.assistId)})</span>}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Oyuncu Puanlama Alanı */}
                <div>
                   <h3 className="font-bold text-sm mb-3 border-b border-slate-700 pb-2 flex justify-between items-center text-slate-300">
                     Ortalama Oyuncu Puanları
                   </h3>
                   {selectedMatch.status === 'active' && myTeam && (
                     <div className="text-xs text-cyan-400 mb-4 bg-cyan-900/20 p-2 rounded border border-cyan-800">
                       Bilgi: Sadece kendi takımın ({myTeam === 'A' ? selectedMatch.teamAName : selectedMatch.teamBName}) için 1-10 arası puan girebilirsin. Girdiğin puan anında ortalamaya etki eder.
                     </div>
                   )}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Takım A */}
                      <div className="space-y-3 border-r border-slate-700 pr-4">
                        <div className="text-blue-400 font-bold text-sm mb-2">{selectedMatch.teamAName}</div>
                        {selectedMatch.teamA.map(p => {
                          const avg = getAverageRating(p.playerId);
                          const myRating = selectedMatch.ratings[p.playerId]?.[currentUserData.id] || '';
                          const canRate = canRatePlayer(p.playerId, 'A');
                          return (
                            <div key={p.playerId} className="flex justify-between items-center text-sm bg-slate-900/30 p-2 rounded">
                              <span className="truncate w-32">{getPlayerName(p.playerId)}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-yellow-400 w-8 text-right">{avg ? avg : '-'}</span>
                                {canRate && (
                                  <input type="number" min="1" max="10" step="1" placeholder="Puan ver"
                                    className="w-16 bg-slate-900 border border-slate-600 rounded p-1 text-center text-white text-xs outline-none focus:border-cyan-400"
                                    value={myRating} onChange={(e) => handleRatingChange(p.playerId, e.target.value)} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Takım B */}
                      <div className="space-y-3 pl-4">
                        <div className="text-pink-400 font-bold text-sm mb-2">{selectedMatch.teamBName}</div>
                        {selectedMatch.teamB.map(p => {
                           const avg = getAverageRating(p.playerId);
                           const myRating = selectedMatch.ratings[p.playerId]?.[currentUserData.id] || '';
                           const canRate = canRatePlayer(p.playerId, 'B');
                           return (
                            <div key={p.playerId} className="flex justify-between items-center text-sm bg-slate-900/30 p-2 rounded">
                              <span className="truncate w-32">{getPlayerName(p.playerId)}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-yellow-400 w-8 text-right">{avg ? avg : '-'}</span>
                                {canRate && (
                                  <input type="number" min="1" max="10" step="1" placeholder="Puan ver"
                                    className="w-16 bg-slate-900 border border-slate-600 rounded p-1 text-center text-white text-xs outline-none focus:border-cyan-400"
                                    value={myRating} onChange={(e) => handleRatingChange(p.playerId, e.target.value)} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                   </div>
                </div>

                {/* Maçı Bitir (Sadece Admin) */}
                {isAdmin && selectedMatch.status === 'active' && (
                  confirmEndMatchId === selectedMatch.id ? (
                    <div className="w-full bg-red-900/30 border border-red-500 p-4 rounded-lg mt-4 text-center transition-all">
                      <p className="text-white font-bold mb-4">Maçı bitirmek istediğinize emin misiniz? Puanlamalar kapatılır ve istatistikler işlenir.</p>
                      <div className="flex justify-center gap-4">
                        <button onClick={() => updateMatchStatus(selectedMatch.id, 'completed')} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Evet, Bitir</button>
                        <button onClick={() => setConfirmEndMatchId(null)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-bold">İptal</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmEndMatchId(selectedMatch.id)} className="w-full bg-red-600 hover:bg-red-500 text-white p-3 rounded-lg font-bold mt-4 shadow-lg transition-colors">Maçı Bitir ve İstatistiklere Ekle</button>
                  )
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-700 rounded-xl">
            <Trophy size={48} className="mb-4 opacity-50" />
            <p>Detayları görmek veya maçı yönetmek için listeden bir maç seçin.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const GoalForm = ({ team, match, players, onAddGoal }) => {
  const [scorer, setScorer] = useState('');
  const [assist, setAssist] = useState('');
  const teamPlayers = match[`team${team}`].map(tp => players.find(p => p.id === tp.playerId)).filter(Boolean);

  const submit = () => {
    if(!scorer) return;
    onAddGoal(scorer, assist === 'none' ? null : assist);
    setScorer(''); setAssist('');
  };

  const handleScorerChange = (e) => {
    const newScorer = e.target.value;
    setScorer(newScorer);
    if (assist === newScorer) setAssist('');
  };

  return (
    <div className={`p-3 rounded border ${team === 'A' ? 'border-blue-900 bg-blue-900/10' : 'border-pink-900 bg-pink-900/10'}`}>
      <div className={`text-xs font-bold mb-2 ${team === 'A' ? 'text-blue-400' : 'text-pink-400'}`}>{match[`team${team}Name`]}</div>
      <select className="w-full text-sm bg-slate-800 border border-slate-600 rounded p-1 mb-2 text-white outline-none" value={scorer} onChange={handleScorerChange}>
        <option value="">Golü Atan Seç...</option>
        <option value="own_goal">Kendi Kalesine</option>
        {teamPlayers.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
      </select>
      <select className="w-full text-sm bg-slate-800 border border-slate-600 rounded p-1 mb-2 text-white outline-none" value={assist} onChange={e => setAssist(e.target.value)} disabled={scorer === 'own_goal'}>
        <option value="">Asist Yapan (Yoksa boş bırak)</option>
        <option value="none">Asist Yok</option>
        {teamPlayers.filter(p => p.id !== scorer).map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
      </select>
      <button onClick={submit} className="w-full bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded text-white font-bold transition-colors">Ekle</button>
    </div>
  );
};


// ==========================================
// 4. İSTATİSTİKLER SEKRESİ
// ==========================================
function StatsTab({ players, matches }) {
  const completedMatches = matches.filter(m => m.status === 'completed');
  const totalMatches = completedMatches.length;
  let totalGoals = 0;

  const statsMap = {};
  players.forEach(p => {
    statsMap[p.id] = { id: p.id, name: `${p.firstName} ${p.lastName}`, matches: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0 };
  });

  completedMatches.forEach(m => {
    totalGoals += m.scoreA + m.scoreB;

    const allPlayersInMatch = [...m.teamA, ...m.teamB, ...m.subs.map(id => ({playerId: id}))];
    allPlayersInMatch.forEach(pObj => {
      if(statsMap[pObj.playerId]) {
        statsMap[pObj.playerId].matches += 1;
        
        // Puan Ortalaması Hesaplama Mantığı Değişti
        const playerRatings = m.ratings[pObj.playerId];
        if (playerRatings) {
          const vals = Object.values(playerRatings);
          if (vals.length > 0) {
            const matchAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
            statsMap[pObj.playerId].ratingSum += matchAvg;
            statsMap[pObj.playerId].ratingCount += 1; // Kaç maçta puanlandıysa ona bölmek için
          }
        }
      }
    });

    m.events.forEach(ev => {
      if(ev.type === 'goal') {
        if(ev.scorerId !== 'own_goal' && statsMap[ev.scorerId]) statsMap[ev.scorerId].goals += 1;
        if(ev.assistId && statsMap[ev.assistId]) statsMap[ev.assistId].assists += 1;
      }
    });
  });

  const statsArray = Object.values(statsMap).filter(s => s.matches > 0);

  const topScorers = [...statsArray].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topAssists = [...statsArray].sort((a, b) => b.assists - a.assists).slice(0, 5);
  
  const topRatings = [...statsArray]
    .map(s => ({ ...s, avgRating: s.ratingCount > 0 ? (s.ratingSum / s.ratingCount).toFixed(2) : 0 }))
    .sort((a, b) => b.avgRating - a.avgRating)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-2xl border border-blue-500/30 text-center shadow-lg">
          <div className="text-4xl font-black text-white mb-1">{totalMatches}</div>
          <div className="text-sm text-blue-300 font-semibold uppercase tracking-wider">Oynanan Maç</div>
        </div>
        <div className="bg-gradient-to-br from-cyan-900 to-slate-900 p-6 rounded-2xl border border-cyan-500/30 text-center shadow-lg">
          <div className="text-4xl font-black text-white mb-1">{totalGoals}</div>
          <div className="text-sm text-cyan-300 font-semibold uppercase tracking-wider">Atılan Gol</div>
        </div>
        <div className="bg-gradient-to-br from-pink-900 to-slate-900 p-6 rounded-2xl border border-pink-500/30 text-center shadow-lg">
          <div className="text-4xl font-black text-white mb-1">{totalMatches > 0 ? (totalGoals/totalMatches).toFixed(1) : 0}</div>
          <div className="text-sm text-pink-300 font-semibold uppercase tracking-wider">Maç Başı Gol</div>
        </div>
        <div className="bg-gradient-to-br from-purple-900 to-slate-900 p-6 rounded-2xl border border-purple-500/30 text-center shadow-lg">
          <div className="text-4xl font-black text-white mb-1">{players.filter(p=>p.status==='approved').length}</div>
          <div className="text-sm text-purple-300 font-semibold uppercase tracking-wider">Onaylı Oyuncu</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className={`${THEME.panel} p-6 rounded-xl border border-yellow-500/30`}>
          <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2 border-b border-slate-700 pb-2">
            <Goal size={20} /> Gol Krallığı
          </h3>
          <ul className="space-y-3">
            {topScorers.map((s, idx) => (
              <li key={s.id} className="flex justify-between items-center bg-slate-900/50 p-2 rounded">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 font-bold w-4">{idx + 1}.</span>
                  <div>
                    <div className="font-bold">{s.name}</div>
                    <div className="text-[10px] text-slate-400">{s.matches} maçta</div>
                  </div>
                </div>
                <div className="text-xl font-black text-yellow-400">{s.goals}</div>
              </li>
            ))}
            {topScorers.length === 0 && <p className="text-sm text-slate-500 text-center">Henüz veri yok</p>}
          </ul>
        </div>

        <div className={`${THEME.panel} p-6 rounded-xl border border-cyan-500/30`}>
          <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2 border-b border-slate-700 pb-2">
            <Users size={20} /> Asist Krallığı
          </h3>
          <ul className="space-y-3">
            {topAssists.map((s, idx) => (
              <li key={s.id} className="flex justify-between items-center bg-slate-900/50 p-2 rounded">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 font-bold w-4">{idx + 1}.</span>
                  <div>
                    <div className="font-bold">{s.name}</div>
                    <div className="text-[10px] text-slate-400">{s.matches} maçta</div>
                  </div>
                </div>
                <div className="text-xl font-black text-cyan-400">{s.assists}</div>
              </li>
            ))}
             {topAssists.length === 0 && <p className="text-sm text-slate-500 text-center">Henüz veri yok</p>}
          </ul>
        </div>

        <div className={`${THEME.panel} p-6 rounded-xl border border-blue-500/30 lg:col-span-1 md:col-span-2`}>
          <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2 border-b border-slate-700 pb-2">
            <Star size={20} /> En Yüksek Puan Ortalaması
          </h3>
          <ul className="space-y-3">
            {topRatings.filter(r => r.avgRating > 0).map((s, idx) => (
              <li key={s.id} className="flex justify-between items-center bg-slate-900/50 p-2 rounded border-l-2 border-blue-500">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 font-bold w-4">{idx + 1}.</span>
                  <div>
                    <div className="font-bold">{s.name}</div>
                    <div className="text-[10px] text-slate-400">{s.matches} maç oynadı</div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                   <div className="text-lg font-black text-blue-300">{s.avgRating}</div>
                   <div className="flex text-yellow-400">
                     {[...Array(Math.round(s.avgRating / 2))].map((_, i) => <Star key={i} size={10} fill="currentColor" />)}
                   </div>
                </div>
              </li>
            ))}
             {topRatings.filter(r => r.avgRating > 0).length === 0 && <p className="text-sm text-slate-500 text-center">Henüz veri yok</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}