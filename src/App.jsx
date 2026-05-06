import React, { useState, useEffect } from 'react';
import { Users, LayoutTemplate, CalendarDays, Trophy, Trash2, Plus, Save, Play, Star, Goal, Edit, ShieldCheck, UserCheck, ShieldAlert, Shield, LogOut, KeyRound, Lock, Unlock, Settings, X, Check, User, Image as ImageIcon } from 'lucide-react';

// --- FIREBASE BAĞLANTISI ---
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
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

// --- YENİ KURAL: BOL KESEDEN PUAN VERENLERİ TESPİT ET (Ortalama > 9) ---
const getBannedRaters = (ratingsObj) => {
  if (!ratingsObj) return [];
  const raterStats = {};
  
  // Kim kime kaç puan vermiş hesapla
  Object.entries(ratingsObj).forEach(([targetId, targetRatings]) => {
    Object.entries(targetRatings).forEach(([raterId, score]) => {
      if (targetId === raterId) return; // Kendi oyu hariç
      if (!raterStats[raterId]) raterStats[raterId] = { sum: 0, count: 0 };
      raterStats[raterId].sum += score;
      raterStats[raterId].count += 1;
    });
  });

  // Ortalaması 9'dan büyük olanları listeye al
  return Object.entries(raterStats)
    .filter(([_, stats]) => stats.count > 0 && (stats.sum / stats.count) > 9)
    .map(([raterId]) => raterId);
};

// --- PUAN HESAPLAMA YARDIMCISI (Uç Değerleri Kırpar ve Banlıları Gizler) ---
const getTrimmedRatingData = (ratingsObj, targetPlayerId, bannedRaters = []) => {
  if (!ratingsObj) return { avg: null, excludedMinRater: null, excludedMaxRater: null };
  
  // Kendi kendine verilen puanları ve Banlı (Mavi) rater'ları dışla
  const entries = Object.entries(ratingsObj).filter(([raterId]) => raterId !== targetPlayerId && !bannedRaters.includes(raterId));
  if (entries.length === 0) return { avg: null, excludedMinRater: null, excludedMaxRater: null };
  
  // 3'ten az geçerli oy varsa kırpma yapma, normal ortalama al
  if (entries.length < 3) {
      const avg = entries.reduce((acc, [_, val]) => acc + val, 0) / entries.length;
      return { avg, excludedMinRater: null, excludedMaxRater: null };
  }

  // Puanlara göre küçükten büyüğe sırala
  const sortedEntries = [...entries].sort((a, b) => a[1] - b[1]);
  
  // En düşük ve en yüksek puanı veren raterId'leri belirle (sadece 1'er tane)
  const excludedMinRater = sortedEntries[0][0];
  const excludedMaxRater = sortedEntries[sortedEntries.length - 1][0];

  // Baştaki (en düşük) ve Sondaki (en yüksek) elemanı çıkar
  const remainingEntries = sortedEntries.slice(1, sortedEntries.length - 1);
  const avg = remainingEntries.length > 0 ? (remainingEntries.reduce((acc, [_, val]) => acc + val, 0) / remainingEntries.length) : null;

  return { avg, excludedMinRater, excludedMaxRater };
};

// --- BİREYSEL MAÇ PUANI HESAPLAYICI (+0.01 Gol/Asist Etkisi) ---
const calcPlayerMatchRating = (match, playerId, bannedRaters = []) => {
  const ratingData = getTrimmedRatingData(match.ratings?.[playerId], playerId, bannedRaters);
  if (ratingData.avg === null) return null;

  let avg = ratingData.avg;

  const goals = match.events.filter(ev => ev.type === 'goal' && ev.scorerId === playerId).length;
  const assists = match.events.filter(ev => ev.type === 'goal' && ev.assistId === playerId).length;

  // Gol ve Asist başına +0.01 ekle
  avg += (goals + assists) * 0.01;
  
  return Math.max(1, Math.min(10, avg));
};

// Genel İstatistik Hesaplayıcı
const getPlayerStatsMap = (players, matches) => {
  const completedMatches = [...matches].filter(m => m.status === 'completed').sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
  const statsMap = {};
  
  players.forEach(p => { 
    statsMap[p.id] = { 
       id: p.id, name: `${p.firstName} ${p.lastName}`, avatar: p.avatar, number: p.number, 
       matches: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, 
       ratingSum: 0, ratingCount: 0, matchHistory: [] 
    }; 
  });

  completedMatches.forEach(m => {
    const allPlayersInMatch = [...m.teamA, ...m.teamB, ...m.subs.map(id => ({playerId: id}))];
    const bannedRaters = getBannedRaters(m.ratings);
    
    allPlayersInMatch.forEach(pObj => {
      const stat = statsMap[pObj.playerId];
      if(stat) {
        stat.matches += 1;
        
        // Galibiyet, Beraberlik, Mağlubiyet hesapla
        const isTeamA = m.teamA.some(p => p.playerId === pObj.playerId);
        const isTeamB = m.teamB.some(p => p.playerId === pObj.playerId);
        
        if (m.scoreA === m.scoreB) {
            stat.draws++;
        } else if ((isTeamA && m.scoreA > m.scoreB) || (isTeamB && m.scoreB > m.scoreA)) {
            stat.wins++;
        } else {
            stat.losses++;
        }

        // Puan hesaplaması (Kapanmışsa)
        if (m.ratingsClosed) {
          const finalRating = calcPlayerMatchRating(m, pObj.playerId, bannedRaters);
          if (finalRating !== null) {
              stat.ratingSum += finalRating;
              stat.ratingCount += 1;
              stat.matchHistory.push({ date: m.date, rating: finalRating.toFixed(2) });
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

  Object.values(statsMap).forEach(s => {
    s.avgRating = s.ratingCount > 0 ? (s.ratingSum / s.ratingCount).toFixed(2) : 0;
  });

  return statsMap;
};

// --- ANA BİLEŞEN ---
export default function App() {
  const [activeTab, setActiveTab] = useState('profilim');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [appUserId, setAppUserId] = useState(localStorage.getItem('halisaha_userId') || null);
  
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (err) { console.error("Giriş hatası:", err); }
    };
    initAuth();

    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubPlayers = onSnapshot(dbPath('players'), (snap) => setPlayers(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubMatches = onSnapshot(dbPath('matches'), (snap) => setMatches(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubPlayers(); unsubMatches(); };
  }, [firebaseUser]);

  if (authLoading) return <div className={`min-h-screen ${THEME.bg} flex items-center justify-center text-cyan-400`}><Star className="animate-spin w-12 h-12" /></div>;

  const currentUserData = players.find(p => p.id === appUserId);
  const isMasterAdmin = currentUserData?.role === 'master_admin';
  const isAdmin = isMasterAdmin || currentUserData?.role === 'admin';
  
  if (!appUserId || !currentUserData) {
    if (appUserId && players.length > 0) {
      localStorage.removeItem('halisaha_userId');
      setAppUserId(null);
    }
    return <AuthScreen setAppUserId={setAppUserId} players={players} />;
  }

  if (currentUserData?.status === 'pending') {
    return (
      <div className={`min-h-screen ${THEME.bg} ${THEME.text} flex flex-col items-center justify-center p-6 text-center`}>
        <ShieldAlert size={64} className="text-yellow-500 mb-6 animate-pulse" />
        <h1 className="text-3xl font-black mb-4">Onay Bekleniyor</h1>
        <p className="text-slate-400 max-w-md mb-6">Hesabın başarıyla oluşturuldu. Ancak uygulamaya erişmek için adminin onay vermesi gerekiyor. Lütfen daha sonra tekrar kontrol et.</p>
        <button onClick={() => {localStorage.removeItem('halisaha_userId'); setAppUserId(null);}} className="text-sm text-red-400 border border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-500/10">Farklı Bir Hesaba Geç</button>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('halisaha_userId');
    setAppUserId(null);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profilim': return <ProfileTab currentUserData={currentUserData} players={players} matches={matches} />;
      case 'oyuncular': return <PlayersTab players={players} matches={matches} currentUserData={currentUserData} isAdmin={isAdmin} isMasterAdmin={isMasterAdmin} />;
      case 'kadro': return isAdmin ? <SquadTab players={players} matches={matches} /> : null;
      case 'fikstur': return <FixturesTab matches={matches} players={players} currentUserData={currentUserData} isAdmin={isAdmin} isMasterAdmin={isMasterAdmin} />;
      case 'istatistik': return <StatsTab players={players} matches={matches} />;
      case 'admin': return isMasterAdmin ? <AdminSettingsTab players={players} /> : null;
      default: return null;
    }
  };

  return (
    <div className={`min-h-screen ${THEME.bg} ${THEME.text} font-sans`}>
      <header className="bg-slate-950 border-b border-blue-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between py-4">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] overflow-hidden">
                {currentUserData.avatar ? <img src={currentUserData.avatar} className="w-full h-full object-cover" /> : <Star className="text-white w-6 h-6" fill="currentColor" />}
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-200 uppercase leading-none">Champions</h1>
                <span className="text-xs tracking-widest text-slate-400 font-bold">ARENA</span>
              </div>
            </div>
            
            <nav className="flex flex-wrap justify-center gap-2 flex-1 md:px-8 mb-4 md:mb-0">
              <NavButton active={activeTab === 'profilim'} onClick={() => setActiveTab('profilim')} icon={<User size={18} />} text="Profilim" />
              <NavButton active={activeTab === 'oyuncular'} onClick={() => setActiveTab('oyuncular')} icon={<Users size={18} />} text="Oyuncular" />
              {isAdmin && <NavButton active={activeTab === 'kadro'} onClick={() => setActiveTab('kadro')} icon={<LayoutTemplate size={18} />} text="Kadro Kur" /> }
              <NavButton active={activeTab === 'fikstur'} onClick={() => setActiveTab('fikstur')} icon={<CalendarDays size={18} />} text="Fikstür" />
              <NavButton active={activeTab === 'istatistik'} onClick={() => setActiveTab('istatistik')} icon={<Trophy size={18} />} text="İstatistikler" />
              {isMasterAdmin && <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Settings size={18} />} text="Admin Ayarları" /> }
            </nav>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold text-white">{currentUserData.firstName} {currentUserData.lastName}</div>
                <div className="text-[10px] text-cyan-400 font-mono">@{currentUserData.username || currentUserData.id}</div>
              </div>
              <button onClick={handleLogout} className="bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-colors border border-red-500/30" title="Çıkış Yap"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{renderTabContent()}</main>
    </div>
  );
}

const NavButton = ({ active, onClick, icon, text }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${active ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.6)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
    {icon} {text}
  </button>
);


// ==========================================
// 0. GİRİŞ YAP VE KAYIT OL EKRANI
// ==========================================
function AuthScreen({ setAppUserId, players }) {
  const [isLogin, setIsLogin] = useState(true);
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredId, setRegisteredId] = useState(null);

  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');

  const [regData, setRegData] = useState({ username: '', firstName: '', lastName: '', phone: '', group: '', position: 'Forvet', number: '', password: '', passwordConfirm: '' });

  const usedNumbers = players.map(p => Number(p.number));
  const availableNumbers = Array.from({length: 99}, (_, i) => i + 1);

  const showNotif = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginId || !loginPass) return;
    const loginQuery = loginId.trim().toLowerCase();
    
    const user = players.find(p => 
      (p.id.toLowerCase() === loginQuery || (p.username && p.username.toLowerCase() === loginQuery)) && 
      p.password === loginPass
    );

    if (user) {
      localStorage.setItem('halisaha_userId', user.id);
      setAppUserId(user.id);
    } else {
      showNotif('error', "Bilgiler veya Şifre hatalı!");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regData.firstName || !regData.number || !regData.position || !regData.password) return;
    
    if (regData.username) {
      const usernameNorm = regData.username.trim().toLowerCase();
      if (players.some(p => p.username && p.username.toLowerCase() === usernameNorm)) {
        showNotif('error', 'Bu kullanıcı adı zaten alınmış!');
        return;
      }
    }

    if (regData.password !== regData.passwordConfirm) {
      showNotif('error', 'Şifreler eşleşmiyor! Lütfen iki şifreyi de aynı giriniz.');
      return;
    }
    
    setIsSubmitting(true);
    const isFirstUser = players.length === 0;

    let newId;
    do { newId = generatePlayerId(); } while (players.some(p => p.id === newId));

    const { passwordConfirm, ...dbData } = regData;
    dbData.username = dbData.username.trim();

    const newUserDoc = { ...dbData, id: newId, role: isFirstUser ? 'master_admin' : 'user', status: isFirstUser ? 'approved' : 'pending', isActive: true, registeredAt: Date.now() };

    await setDoc(doc(dbPath('players'), newId), newUserDoc);
    
    setRegData({ username: '', firstName: '', lastName: '', phone: '', group: '', position: 'Forvet', number: '', password: '', passwordConfirm: '' });
    setIsSubmitting(false);

    if (isFirstUser) {
      localStorage.setItem('halisaha_userId', newId);
      setAppUserId(newId);
    } else {
      setRegisteredId(newId);
    }
  };

  if (registeredId) {
    return (
      <div className={`min-h-screen ${THEME.bg} ${THEME.text} flex flex-col items-center justify-center p-6 text-center`}>
         <div className={`${THEME.panel} p-8 rounded-2xl border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] max-w-md w-full`}>
            <Check size={64} className="text-green-400 mx-auto mb-6" />
            <h2 className="text-2xl font-black mb-2 text-white">Kayıt Başarılı!</h2>
            <p className="text-slate-400 mb-6 text-sm">Sisteme giriş yapabilmeniz için gereken Hesap ID numaranız aşağıdadır. Admin onayından sonra giriş yapabileceksiniz.</p>
            <div className="bg-slate-900 border border-cyan-500 p-4 rounded-lg mb-6">
               <div className="text-xs text-cyan-400 font-bold mb-1 uppercase tracking-widest">Hesap ID'niz</div>
               <div className="text-5xl font-black font-mono text-white tracking-widest">{registeredId}</div>
            </div>
            <div className="bg-red-900/40 border border-red-500/50 text-red-300 p-3 rounded-lg text-sm font-bold mb-6 flex flex-col gap-1 items-center">
               <ShieldAlert size={20}/>
               LÜTFEN ID NUMARANIZI NOT EDİNİZ!
            </div>
            <button onClick={() => {setRegisteredId(null); setIsLogin(true);}} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors">
              Giriş Ekranına Dön
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${THEME.bg} ${THEME.text} flex items-center justify-center p-4`}>
      <div className={`${THEME.panel} p-8 rounded-2xl border ${THEME.border} max-w-md w-full shadow-2xl`}>
        <div className="text-center mb-8">
           <div className="w-16 h-16 mx-auto rounded-full bg-blue-900 flex items-center justify-center border-2 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)] mb-4">
             <Trophy className="text-white w-8 h-8" />
           </div>
           <h2 className="text-2xl font-black">Champions Arena</h2>
        </div>

        <div className="flex rounded-lg bg-slate-900 p-1 mb-6 border border-slate-700">
          <button onClick={() => setIsLogin(true)} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${isLogin ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Giriş Yap</button>
          <button onClick={() => setIsLogin(false)} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!isLogin ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Kayıt Ol</button>
        </div>

        {notification && (
          <div className={`p-3 rounded-lg text-sm text-center mb-4 border ${notification.type === 'error' ? 'bg-red-900/50 text-red-400 border-red-500/50' : 'bg-green-900/50 text-green-400 border-green-500/50'}`}>
            {notification.text}
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hesap ID veya Kullanıcı Adı</label>
              <input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-cyan-400 font-mono text-center text-lg" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="ID veya @kullaniciadi" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Şifre</label>
              <input required type="password" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-cyan-400" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••" />
            </div>
            <button type="submit" className="w-full mt-2 py-3 rounded-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg transition-all flex justify-center items-center gap-2">
              <KeyRound size={18} /> Sisteme Giriş
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Kullanıcı Adı (İsteğe Bağlı)</label>
              <input type="text" placeholder="Giriş yaparken kullanabilirsiniz" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-slate-400 mb-1">Ad <span className="text-red-500">*</span></label><input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.firstName} onChange={e => setRegData({...regData, firstName: e.target.value})} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Soyad</label><input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.lastName} onChange={e => setRegData({...regData, lastName: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Forma No <span className="text-red-500">*</span></label>
                <select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.number} onChange={e => setRegData({...regData, number: e.target.value})}>
                  <option value="">Seç...</option>
                  {availableNumbers.map(num => <option key={num} value={num} disabled={usedNumbers.includes(num)}>{num} {usedNumbers.includes(num) ? '(Dolu)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Pozisyon <span className="text-red-500">*</span></label>
                <select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.position} onChange={e => setRegData({...regData, position: e.target.value})}>
                  <option>Kaleci</option><option>Defans</option><option>Orta Saha</option><option>Forvet</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-slate-400 mb-1">Telefon No</label><input type="tel" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.phone} onChange={e => setRegData({...regData, phone: e.target.value})} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Ekip/Grup</label><input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.group} onChange={e => setRegData({...regData, group: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Şifre Belirle <span className="text-red-500">*</span></label>
                <input required type="password" placeholder="Şifre" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Şifre Tekrar <span className="text-red-500">*</span></label>
                <input required type="password" placeholder="Şifre Tekrar" className={`w-full bg-slate-900 border rounded p-2 text-white outline-none focus:border-cyan-400 ${regData.passwordConfirm && regData.password !== regData.passwordConfirm ? 'border-red-500' : 'border-slate-700'}`} value={regData.passwordConfirm} onChange={e => setRegData({...regData, passwordConfirm: e.target.value})} />
              </div>
            </div>
            <button type="submit" disabled={isSubmitting} className={`w-full mt-4 py-3 rounded-lg font-bold transition-all flex justify-center items-center gap-2 ${isSubmitting ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg'}`}>
              {isSubmitting ? <Star className="animate-spin" size={18} /> : null}
              {isSubmitting ? 'İşleniyor...' : 'Üye Ol ve Onaya Gönder'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 1. PROFİLİM SEKRESİ
// ==========================================
function ProfileTab({ currentUserData, players, matches }) {
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [usernameInput, setUsernameInput] = useState(currentUserData.username || '');
  const [avatarInput, setAvatarInput] = useState(currentUserData.avatar || '');
  const [msg, setMsg] = useState(null);

  const statsMap = getPlayerStatsMap(players, matches);
  const myStats = statsMap[currentUserData.id] || { matches: 0, goals: 0, assists: 0, avgRating: '-' };

  const showMessage = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const saveUsername = async () => {
    const usernameNorm = usernameInput.trim().toLowerCase();
    if (usernameNorm && players.some(p => p.username?.toLowerCase() === usernameNorm && p.id !== currentUserData.id)) {
      return showMessage('error', 'Bu kullanıcı adı zaten kullanılıyor!');
    }
    await updateDoc(doc(dbPath('players'), currentUserData.id), { username: usernameInput.trim() });
    showMessage('success', 'Kullanıcı adı güncellendi!');
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pass1 !== pass2) return showMessage('error', 'Şifreler eşleşmiyor!');
    if (pass1.length < 3) return showMessage('error', 'Şifre çok kısa!');
    await updateDoc(doc(dbPath('players'), currentUserData.id), { password: pass1 });
    showMessage('success', 'Şifreniz başarıyla değişti!');
    setPass1(''); setPass2('');
  };

  const saveAvatar = async () => {
    await updateDoc(doc(dbPath('players'), currentUserData.id), { avatar: avatarInput });
    showMessage('success', 'Profil fotoğrafı güncellendi!');
  };

  const removeAvatar = async () => {
    await updateDoc(doc(dbPath('players'), currentUserData.id), { avatar: '' });
    setAvatarInput('');
    showMessage('success', 'Profil fotoğrafı kaldırıldı!');
  };

  return (
    <div className="space-y-8">
      {msg && <div className={`p-4 rounded-lg font-bold border shadow-lg transition-all text-center ${msg.type === 'error' ? 'bg-red-900/50 text-red-400 border-red-500' : 'bg-green-900/50 text-green-400 border-green-500'}`}>{msg.text}</div>}
      
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 p-6 rounded-xl flex flex-col md:flex-row items-center gap-6 shadow-lg">
        <div className="w-20 h-20 rounded-full bg-blue-900/50 flex items-center justify-center border-2 border-cyan-500 overflow-hidden shadow-[0_0_15px_rgba(34,211,238,0.5)]">
           {currentUserData.avatar ? <img src={currentUserData.avatar} alt="profil" className="w-full h-full object-cover" /> : <span className="text-3xl font-black text-cyan-400">{currentUserData.number}</span>}
        </div>
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-2xl font-bold text-white">{currentUserData.firstName} {currentUserData.lastName} <span className="text-sm font-normal text-slate-400">({currentUserData.position})</span></h2>
          <p className="text-slate-400 text-sm mt-1">Kariyerini yönet, profil fotoğrafı ve giriş bilgini düzenle.</p>
        </div>
        <div className="bg-slate-950 p-4 rounded-lg border border-cyan-500/30 text-center min-w-[150px]">
          <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold mb-1">Hesap ID</div>
          <div className="text-2xl font-mono font-black text-white tracking-widest">{currentUserData.id}</div>
        </div>
      </div>

      <h2 className="text-xl font-bold border-b border-slate-700 pb-3 flex items-center gap-2">
        <Trophy className={THEME.accent} /> Kariyer İstatistiklerin
      </h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-2xl border border-blue-500/30 text-center shadow-lg"><div className="text-4xl font-black text-white mb-1">{myStats.matches}</div><div className="text-sm text-blue-300 font-semibold uppercase tracking-wider">Oynanan Maç</div></div>
        <div className="bg-gradient-to-br from-cyan-900 to-slate-900 p-6 rounded-2xl border border-cyan-500/30 text-center shadow-lg"><div className="text-4xl font-black text-white mb-1">{myStats.goals}</div><div className="text-sm text-cyan-300 font-semibold uppercase tracking-wider">Attığın Gol</div></div>
        <div className="bg-gradient-to-br from-pink-900 to-slate-900 p-6 rounded-2xl border border-pink-500/30 text-center shadow-lg"><div className="text-4xl font-black text-white mb-1">{myStats.assists}</div><div className="text-sm text-pink-300 font-semibold uppercase tracking-wider">Asist</div></div>
        <div className="bg-gradient-to-br from-yellow-900 to-slate-900 p-6 rounded-2xl border border-yellow-500/30 text-center shadow-lg"><div className="text-4xl font-black text-yellow-400 mb-1">{myStats.avgRating > 0 ? myStats.avgRating : '-'}</div><div className="text-sm text-yellow-300 font-semibold uppercase tracking-wider">Ortalama Puan</div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        
        {/* Ayarlar Sol Sütun */}
        <div className="space-y-6">
            <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border}`}>
               <h2 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-slate-700 pb-2"><User className="text-cyan-400" /> Kullanıcı Adı</h2>
               <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <label className="block text-xs text-slate-400 mb-2">Sisteme Giriş Adı</label>
                  <div className="flex gap-2">
                      <div className="flex-1 flex items-center bg-slate-800 border border-slate-600 rounded px-2">
                          <span className="text-slate-500">@</span>
                          <input type="text" placeholder="kullaniciadi" className="w-full bg-transparent p-2 text-white outline-none focus:border-cyan-400 text-sm" value={usernameInput} onChange={e => setUsernameInput(e.target.value.replace(/\s+/g, ''))} />
                      </div>
                      <button type="button" onClick={saveUsername} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded text-sm transition-colors">Kaydet</button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">Bu kullanıcı adını kullanarak 6 haneli ID numarasına ihtiyaç duymadan sisteme giriş yapabilirsiniz.</p>
               </div>
            </div>

            <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border}`}>
               <h2 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-slate-700 pb-2"><ImageIcon className="text-cyan-400" /> Profil Fotoğrafı</h2>
               <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <label className="block text-xs text-slate-400 mb-2">Fotoğraf Bağlantısı (URL)</label>
                  <div className="flex gap-2">
                      <input type="text" placeholder="https://ornek.com/foto.jpg" className="flex-1 bg-slate-800 border border-slate-600 rounded p-2 text-white outline-none focus:border-cyan-400 text-sm" value={avatarInput} onChange={e => setAvatarInput(e.target.value)} />
                      <button type="button" onClick={saveAvatar} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded text-sm transition-colors">Kaydet</button>
                      {currentUserData.avatar && (
                         <button type="button" onClick={removeAvatar} className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded text-sm transition-colors">Kaldır</button>
                      )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">İnternetteki bir fotoğrafın bağlantısını (.jpg, .png) yapıştırın.</p>
               </div>
            </div>
        </div>

        {/* Ayarlar Sağ Sütun */}
        <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border}`}>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-slate-700 pb-2"><KeyRound className="text-orange-400" /> Şifre İşlemleri</h2>
          
          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 mb-6 text-sm flex justify-between items-center">
            <span className="text-slate-400">Mevcut Şifreniz:</span>
            <span className="font-mono text-cyan-400 text-lg font-bold">{currentUserData.password}</span>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Yeni Şifre Belirle</label>
              <input required type="password" placeholder="Yeni şifrenizi girin" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={pass1} onChange={e => setPass1(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Yeni Şifre (Tekrar)</label>
              <input required type="password" placeholder="Şifrenizi tekrar girin" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={pass2} onChange={e => setPass2(e.target.value)} />
            </div>
            <button type="submit" className="w-full mt-2 py-3 rounded-lg font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-lg transition-all flex justify-center items-center gap-2">
               Şifreyi Değiştir
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// YENİ: ADMIN AYARLARI SEKRESİ (SADECE ASIL ADMIN)
// ==========================================
function AdminSettingsTab({ players, matches, currentUserData }) {
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [subTab, setSubTab] = useState('players');
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const saveEdit = async () => {
    if (!editingPlayer.firstName || !editingPlayer.number || !editingPlayer.position) return;
    await updateDoc(doc(dbPath('players'), editingPlayer.id), editingPlayer);
    setEditingPlayer(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm("DİKKAT: Bu kullanıcıyı tamamen silmek istediğinize emin misiniz?")) {
      await deleteDoc(doc(dbPath('players'), id));
    }
  };

  // Rol ağırlıklarına göre sıralama (Master -> Admin -> User) sonra Alfabetik
  const sortedPlayers = [...players].sort((a, b) => {
      const roleWeight = { master_admin: 1, admin: 2, user: 3 };
      if (roleWeight[a.role] !== roleWeight[b.role]) return roleWeight[a.role] - roleWeight[b.role];
      return a.firstName.localeCompare(b.firstName);
  });

  const handleForceRatingChange = async (matchId, targetPlayerId, raterId, val) => {
    const match = matches.find(m => m.id === matchId);
    if(!match) return;
    const numVal = Number(val);
    const newRatings = { ...match.ratings };
    if (!newRatings[targetPlayerId]) newRatings[targetPlayerId] = {};
    
    if (val === '') {
        delete newRatings[targetPlayerId][raterId];
    } else if (numVal >= 1 && numVal <= 10) {
        newRatings[targetPlayerId][raterId] = numVal;
    } else {
        return;
    }
    await updateDoc(doc(dbPath('matches'), matchId), { ratings: newRatings });
  };

  const getPlayerName = (id) => {
    const p = players.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : 'Bilinmiyor';
  };

  const sortedMatches = [...matches].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
  const selectedMatch = matches.find(m => m.id === selectedMatchId);
  const bannedRatersForAdminMatch = selectedMatch ? getBannedRaters(selectedMatch.ratings) : [];

  return (
    <div className="space-y-6">
      <div className={`${THEME.panel} p-6 rounded-xl border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]`}>
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b border-red-900/50 pb-3 text-red-400">
          <Settings size={24} /> Tam Yetkili Asıl Admin Paneli
        </h2>
        
        <div className="flex gap-2 mb-6">
            <button onClick={()=>setSubTab('players')} className={`px-4 py-2 rounded font-bold text-sm transition-colors ${subTab === 'players' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Oyuncu Ayarları</button>
            <button onClick={()=>setSubTab('matches')} className={`px-4 py-2 rounded font-bold text-sm transition-colors ${subTab === 'matches' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Maç Ayarları (Puanlama)</button>
        </div>

        {subTab === 'players' && (
            <>
            <p className="text-sm text-slate-400 mb-6">Burada sistemdeki tüm kullanıcıların (onaylı/onaysız) gizli bilgilerini görebilir ve düzenleyebilirsiniz. Şifreler dahil tüm yetkiler elinizdedir.</p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-3 rounded-tl-lg w-12 text-center">No</th>
                    <th className="p-3">Kullanıcı Bilgisi</th>
                    <th className="p-3">Pozisyon & İletişim</th>
                    <th className="p-3 text-orange-400">Gizli Şifre</th>
                    <th className="p-3">Rol / Durum</th>
                    <th className="p-3 rounded-tr-lg text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map(p => {
                      if (editingPlayer?.id === p.id) {
                          return (
                             <tr key={`edit-${p.id}`} className="border-b border-slate-700 bg-slate-800">
                                <td colSpan={6} className="p-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-4">
                                        <div><label className="text-[10px] text-slate-400">Ad</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.firstName} onChange={e=>setEditingPlayer({...editingPlayer, firstName: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-slate-400">Soyad</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.lastName} onChange={e=>setEditingPlayer({...editingPlayer, lastName: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-slate-400">Kullanıcı Adı</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.username || ''} onChange={e=>setEditingPlayer({...editingPlayer, username: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-slate-400">Şifre</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.password} onChange={e=>setEditingPlayer({...editingPlayer, password: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-slate-400">Forma No</label><input type="number" className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.number} onChange={e=>setEditingPlayer({...editingPlayer, number: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-slate-400">Pozisyon</label><select className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.position} onChange={e=>setEditingPlayer({...editingPlayer, position: e.target.value})}><option>Kaleci</option><option>Defans</option><option>Orta Saha</option><option>Forvet</option></select></div>
                                        <div><label className="text-[10px] text-slate-400">Telefon</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.phone || ''} onChange={e=>setEditingPlayer({...editingPlayer, phone: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-slate-400">Grup</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.group || ''} onChange={e=>setEditingPlayer({...editingPlayer, group: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-slate-400">Rol</label><select className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.role} onChange={e=>setEditingPlayer({...editingPlayer, role: e.target.value})}><option value="user">User</option><option value="admin">Admin</option><option value="master_admin">Master Admin</option></select></div>
                                        <div><label className="text-[10px] text-slate-400">Durum</label><select className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs outline-none focus:border-red-400" value={editingPlayer.status} onChange={e=>setEditingPlayer({...editingPlayer, status: e.target.value})}><option value="approved">Approved</option><option value="pending">Pending</option></select></div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setEditingPlayer(null)} className="text-slate-400 hover:text-white font-bold text-xs bg-slate-700 px-4 py-2 rounded">İptal</button>
                                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300 font-bold text-xs bg-green-900/40 px-4 py-2 rounded border border-green-700 flex items-center gap-1"><Check size={14}/> Kaydet</button>
                                    </div>
                                </td>
                             </tr>
                          );
                      }

                      return (
                          <tr key={p.id} className="border-b border-slate-700 hover:bg-slate-800 transition-colors">
                            <td className="p-3 text-cyan-400 font-bold text-center text-lg">{p.number || '-'}</td>
                            <td className="p-3">
                                <div className="font-bold text-white flex items-center gap-2">
                                  {p.avatar && <img src={p.avatar} className="w-5 h-5 rounded-full object-cover border border-slate-600" />}
                                  {p.firstName} {p.lastName}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">ID: <span className="text-cyan-500">{p.id}</span> {p.username && <span className="ml-1 text-blue-300">@{p.username}</span>}</div>
                            </td>
                            <td className="p-3 text-xs">
                                <div className={`px-2 py-0.5 rounded inline-block mb-1 ${p.position === 'Kaleci' ? 'bg-yellow-600/20 text-yellow-400' : p.position === 'Defans' ? 'bg-blue-600/20 text-blue-400' : p.position === 'Orta Saha' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>{p.position}</div>
                                <div className="text-slate-400">{p.phone || '-'}</div>
                            </td>
                            <td className="p-3 text-xs font-mono font-bold text-orange-400 bg-slate-900/50">{p.password}</td>
                            <td className="p-3 text-xs">
                                <div className={`px-2 py-0.5 rounded inline-block mb-1 ${p.role === 'master_admin' ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700' : p.role === 'admin' ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-700' : 'bg-slate-700 text-slate-300'}`}>{p.role}</div>
                                <div className={`px-2 py-0.5 rounded inline-block ml-1 ${p.status === 'approved' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>{p.status}</div>
                            </td>
                            <td className="p-3 text-center">
                                 <div className="flex gap-2 justify-center">
                                     <button onClick={() => setEditingPlayer(p)} className="text-blue-400 p-1.5 bg-blue-900/20 rounded hover:bg-blue-600 hover:text-white transition-colors" title="Düzenle"><Edit size={14}/></button>
                                     <button onClick={() => handleDelete(p.id)} className="text-red-400 p-1.5 bg-red-900/20 rounded hover:bg-red-600 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed" disabled={p.role === 'master_admin'} title="Sil"><Trash2 size={14}/></button>
                                 </div>
                            </td>
                          </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>
            </>
        )}

        {subTab === 'matches' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-4 max-h-[600px] overflow-y-auto pr-2">
                   {sortedMatches.length === 0 && <p className="text-slate-500">Maç bulunamadı.</p>}
                   {sortedMatches.map(m => (
                      <div key={m.id} onClick={() => setSelectedMatchId(m.id)} className={`p-4 rounded-xl border cursor-pointer hover:bg-slate-700 transition-all ${selectedMatch?.id === m.id ? 'bg-slate-700 border-cyan-400' : 'bg-slate-800 border-slate-700'}`}>
                         <div className="text-xs text-slate-400 mb-1">{m.date} - {m.time}</div>
                         <div className="font-bold flex justify-between">
                            <span className="text-blue-400 truncate w-1/3">{m.teamAName}</span>
                            <span className="text-white">{m.scoreA} - {m.scoreB}</span>
                            <span className="text-pink-400 truncate w-1/3 text-right">{m.teamBName}</span>
                         </div>
                      </div>
                   ))}
                </div>
                <div className="lg:col-span-2">
                   {selectedMatch ? (
                     <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                        <h3 className="text-lg font-bold mb-4 border-b border-slate-700 pb-2 text-white">Puan Düzenleme: {selectedMatch.teamAName} vs {selectedMatch.teamBName}</h3>
                        <p className="text-xs text-slate-400 mb-6">Buradan maçtaki tüm oylamaları detaylıca görebilir, oyları değiştirebilir veya oy vermeyen oyuncular yerine direkt oy ekleyebilirsiniz.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           {/* Team A Admin View */}
                           <div className="space-y-4 border-r border-slate-700 pr-4">
                             <h4 className="font-bold text-blue-400 text-center bg-blue-900/20 py-2 rounded">{selectedMatch.teamAName}</h4>
                             {selectedMatch.teamA.map(p => {
                                const ratingData = getTrimmedRatingData(selectedMatch.ratings[p.playerId], p.playerId, bannedRatersForAdminMatch);
                                const allMatchPlayers = [...selectedMatch.teamA, ...selectedMatch.teamB];
                                return (
                                   <div key={p.playerId} className="bg-slate-900 p-3 rounded border border-slate-700">
                                      <div className="font-bold text-sm mb-3 border-b border-slate-700/50 pb-1 text-white">{getPlayerName(p.playerId)}</div>
                                      <div className="space-y-1.5">
                                        {allMatchPlayers.filter(mp => mp.playerId !== p.playerId).map(mp => {
                                              const raterId = mp.playerId;
                                              const score = selectedMatch.ratings[p.playerId]?.[raterId] || '';
                                              
                                              const isBanned = bannedRatersForAdminMatch.includes(raterId);
                                              const isExcludedMin = raterId === ratingData.excludedMinRater;
                                              const isExcludedMax = raterId === ratingData.excludedMaxRater;
                                              
                                              let textColor = "text-yellow-400";
                                              if (score !== '') {
                                                  if (isBanned) textColor = "text-blue-400";
                                                  else if (isExcludedMax) textColor = "text-green-400";
                                                  else if (isExcludedMin) textColor = "text-red-400";
                                              }

                                              return (
                                                <div key={raterId} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-800 hover:border-cyan-500/30 transition-colors">
                                                   <span className={`truncate flex-1 pl-1 text-xs ${score === '' ? 'text-slate-500 italic' : 'text-slate-300'}`}>{getPlayerName(raterId)}</span>
                                                   <input type="number" min="1" max="10" 
                                                          className={`w-12 bg-slate-800 font-bold border border-slate-600 rounded text-center outline-none focus:border-cyan-400 text-xs py-1 ${textColor}`} 
                                                          value={score} 
                                                          onChange={(e) => handleForceRatingChange(selectedMatch.id, p.playerId, raterId, e.target.value)} 
                                                          placeholder="-" />
                                                </div>
                                              );
                                        })}
                                      </div>
                                   </div>
                                )
                             })}
                           </div>
                           {/* Team B Admin View */}
                           <div className="space-y-4 pl-4">
                             <h4 className="font-bold text-pink-400 text-center bg-pink-900/20 py-2 rounded">{selectedMatch.teamBName}</h4>
                             {selectedMatch.teamB.map(p => {
                                const ratingData = getTrimmedRatingData(selectedMatch.ratings[p.playerId], p.playerId, bannedRatersForAdminMatch);
                                const allMatchPlayers = [...selectedMatch.teamA, ...selectedMatch.teamB];
                                return (
                                   <div key={p.playerId} className="bg-slate-900 p-3 rounded border border-slate-700">
                                      <div className="font-bold text-sm mb-3 border-b border-slate-700/50 pb-1 text-white">{getPlayerName(p.playerId)}</div>
                                      <div className="space-y-1.5">
                                        {allMatchPlayers.filter(mp => mp.playerId !== p.playerId).map(mp => {
                                              const raterId = mp.playerId;
                                              const score = selectedMatch.ratings[p.playerId]?.[raterId] || '';
                                              
                                              const isBanned = bannedRatersForAdminMatch.includes(raterId);
                                              const isExcludedMin = raterId === ratingData.excludedMinRater;
                                              const isExcludedMax = raterId === ratingData.excludedMaxRater;
                                              
                                              let textColor = "text-yellow-400";
                                              if (score !== '') {
                                                  if (isBanned) textColor = "text-blue-400";
                                                  else if (isExcludedMax) textColor = "text-green-400";
                                                  else if (isExcludedMin) textColor = "text-red-400";
                                              }

                                              return (
                                                <div key={raterId} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-800 hover:border-cyan-500/30 transition-colors">
                                                   <span className={`truncate flex-1 pl-1 text-xs ${score === '' ? 'text-slate-500 italic' : 'text-slate-300'}`}>{getPlayerName(raterId)}</span>
                                                   <input type="number" min="1" max="10" 
                                                          className={`w-12 bg-slate-800 font-bold border border-slate-600 rounded text-center outline-none focus:border-cyan-400 text-xs py-1 ${textColor}`} 
                                                          value={score} 
                                                          onChange={(e) => handleForceRatingChange(selectedMatch.id, p.playerId, raterId, e.target.value)} 
                                                          placeholder="-" />
                                                </div>
                                              );
                                        })}
                                      </div>
                                   </div>
                                )
                             })}
                           </div>
                        </div>
                        <div className="mt-6 p-3 bg-slate-900 rounded border border-slate-700 text-center">
                           <div className="text-[10px] text-slate-400 flex flex-wrap justify-center gap-4">
                              <span className="text-green-400 font-bold bg-green-900/20 px-2 py-1 rounded">Yeşil: Ortalamadan +2 Fazla (İptal)</span>
                              <span className="text-red-400 font-bold bg-red-900/20 px-2 py-1 rounded">Kırmızı: En Düşük (İptal)</span>
                              <span className="text-blue-400 font-bold bg-blue-900/20 px-2 py-1 rounded">Mavi: Ortalaması 9'u Geçen Rater (İptal)</span>
                           </div>
                        </div>
                     </div>
                   ) : (
                     <div className="h-full min-h-[300px] flex items-center justify-center border-2 border-dashed border-slate-700 rounded-xl text-slate-500 bg-slate-800/50">
                        Puan detaylarını görmek için soldan bir maç seçin.
                     </div>
                   )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 6. İSTATİSTİKLER SEKRESİ
// ==========================================
// 2. OYUNCU YÖNETİMİ SEKRESİ
// ==========================================
function PlayersTab({ players, matches, currentUserData, isAdmin, isMasterAdmin }) {
  const [formData, setFormData] = useState({ firstName: '', lastName: '', phone: '', group: '', position: 'Forvet', number: '', password: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [showNextMatchRoster, setShowNextMatchRoster] = useState(false);

  const pendingPlayers = players.filter(p => p.status === 'pending');
  const approvedPlayers = players.filter(p => p.status === 'approved');

  const nextMatch = matches
    .slice()
    .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
    .find(m => m.status === 'pending' || m.status === 'active');

  const usedNumbers = players.map(p => Number(p.number));
  const availableNumbers = Array.from({length: 99}, (_, i) => i + 1);

  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!formData.firstName || !formData.number || !formData.position || !formData.password) return;
    let newId; do { newId = generatePlayerId(); } while (players.some(p => p.id === newId));
    await setDoc(doc(dbPath('players'), newId), { ...formData, id: newId, status: 'approved', role: 'user', isActive: true });
    setFormData({ firstName: '', lastName: '', phone: '', group: '', position: 'Forvet', number: '', password: '' });
  };

  const togglePlayerStatus = async (id, currentStatus) => await updateDoc(doc(dbPath('players'), id), { isActive: !currentStatus });
  const confirmDelete = async (id) => { await deleteDoc(doc(dbPath('players'), id)); setDeleteConfirmId(null); };
  const saveEdit = async () => { if (!editingPlayer.firstName || !editingPlayer.number || !editingPlayer.position) return; await updateDoc(doc(dbPath('players'), editingPlayer.id), editingPlayer); setEditingPlayer(null); };
  const approveUser = async (id) => await updateDoc(doc(dbPath('players'), id), { status: 'approved' });
  const grantAdmin = async (id) => await updateDoc(doc(dbPath('players'), id), { role: 'admin' });
  const revokeAdmin = async (id) => await updateDoc(doc(dbPath('players'), id), { role: 'user' });

  return (
    <div className="space-y-8">

      {isAdmin && (
        <div className="bg-gradient-to-r from-blue-900/40 to-cyan-900/10 border border-blue-500/30 p-4 rounded-xl flex items-center gap-3">
          {isMasterAdmin ? <ShieldCheck className="text-yellow-400" size={28} /> : <Shield className="text-cyan-400" size={28} />}
          <div>
            <h2 className="font-bold text-lg text-white">{isMasterAdmin ? 'Asıl Admin Modu Aktif' : 'Admin Modu Aktif'}</h2>
            <p className="text-xs text-slate-400">İşlemlerinizi yapabilirsiniz. Şifre işlemleri için üstteki 'Admin Ayarları' sekmesini kullanın.</p>
          </div>
        </div>
      )}

      {/* GELECEK MAÇ VE DİZİLİŞ EKRANI */}
      {nextMatch && (
        <div className="bg-gradient-to-r from-blue-900/50 to-slate-900 border border-cyan-500/50 p-5 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.15)] cursor-pointer hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all" onClick={() => setShowNextMatchRoster(!showNextMatchRoster)}>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <div className="text-xs text-cyan-400 font-bold uppercase tracking-widest mb-1 animate-pulse">Gelecek Maç</div>
              <div className="text-xl font-bold text-white flex items-center justify-center md:justify-start gap-2">
                <CalendarDays size={20} className="text-slate-400"/> {nextMatch.date} - {nextMatch.time}
              </div>
              <div className="text-sm text-slate-400 mt-1 flex items-center justify-center md:justify-start gap-1">📍 {nextMatch.stadium || 'Baykar Park'}</div>
            </div>
            <div className="flex items-center gap-4">
               <div className="font-black text-xl md:text-2xl text-blue-400 text-right">{nextMatch.teamAName}</div>
               <div className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded-full">VS</div>
               <div className="font-black text-xl md:text-2xl text-pink-400 text-left">{nextMatch.teamBName}</div>
            </div>
          </div>
          
          {showNextMatchRoster && (
            <div className="mt-6 pt-4 border-t border-cyan-500/30" onClick={(e) => e.stopPropagation()}>
               <div className="text-center mb-3 font-bold text-cyan-400 uppercase tracking-widest text-xs">Saha Dizilişi</div>
               
               {/* Görsel Saha Dizilişi Alanı */}
               <div className="relative w-full max-w-2xl mx-auto aspect-[4/3] max-h-[400px] flex overflow-hidden border-2 border-white/50 rounded-lg" style={{background: '#1a5928'}}>
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, #000 10%, #000 20%)'}}></div>
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/80 -ml-[1px] z-10"></div>
                  <div className="absolute left-1/2 top-1/2 w-24 h-24 border-2 border-white/80 rounded-full -ml-12 -mt-12 z-10"></div>
                  <div className="absolute left-0 top-1/2 -mt-16 w-24 h-32 border-2 border-l-0 border-white/80 z-10"></div>
                  <div className="absolute right-0 top-1/2 -mt-16 w-24 h-32 border-2 border-r-0 border-white/80 z-10"></div>
                  
                  {/* Takım A Oyuncuları */}
                  {nextMatch.teamA.map(p => {
                      const player = players.find(x => x.id === p.playerId);
                      if(!player) return null;
                      return (
                          <div key={p.playerId} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-30" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 bg-blue-600 border-blue-300 overflow-hidden">
                                 {player.avatar ? <img src={player.avatar} className="w-full h-full object-cover"/> : (player.number || player.firstName.charAt(0))}
                              </div>
                              <div className="bg-black/80 text-white text-[9px] sm:text-[11px] px-1.5 py-0.5 rounded mt-1 whitespace-nowrap font-semibold border border-slate-700/50">{player.firstName}</div>
                          </div>
                      );
                  })}
                  {/* Takım B Oyuncuları */}
                  {nextMatch.teamB.map(p => {
                      const player = players.find(x => x.id === p.playerId);
                      if(!player) return null;
                      return (
                          <div key={p.playerId} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-30" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 bg-pink-600 border-pink-300 overflow-hidden">
                                 {player.avatar ? <img src={player.avatar} className="w-full h-full object-cover"/> : (player.number || player.firstName.charAt(0))}
                              </div>
                              <div className="bg-black/80 text-white text-[9px] sm:text-[11px] px-1.5 py-0.5 rounded mt-1 whitespace-nowrap font-semibold border border-slate-700/50">{player.firstName}</div>
                          </div>
                      );
                  })}
               </div>
            </div>
          )}
          {!showNextMatchRoster && <div className="text-center mt-3 text-[10px] text-slate-500">Kadro dizilişini görmek için tıklayın</div>}
        </div>
      )}

      {isAdmin && pendingPlayers.length > 0 && (
        <div className={`${THEME.panel} p-6 rounded-xl border border-yellow-500/30 shadow-lg`}>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-yellow-400"><UserCheck /> Onay Bekleyen Üyeler ({pendingPlayers.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingPlayers.map(p => (
              <div key={p.id} className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex justify-between items-center">
                <div><div className="font-bold text-white">{p.firstName} {p.lastName}</div><div className="text-xs text-slate-400">Forma: {p.number} | Poz: {p.position}</div></div>
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
        {isAdmin && (
          <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border} lg:col-span-1 h-fit`}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b border-slate-700 pb-3"><Plus className={THEME.accent} /> Manuel Oyuncu Ekle</h2>
            <form onSubmit={handleManualAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-slate-400 mb-1">Ad *</label><input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} /></div>
                <div><label className="block text-xs text-slate-400 mb-1">Soyad</label><input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-slate-400 mb-1">Forma No *</label><select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})}><option value="">Seç...</option>{availableNumbers.map(num => (<option key={num} value={num} disabled={usedNumbers.includes(num)}>{num} {usedNumbers.includes(num) ? '(Dolu)' : ''}</option>))}</select></div>
                <div><label className="block text-xs text-slate-400 mb-1">Pozisyon *</label><select required className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})}><option>Kaleci</option><option>Defans</option><option>Orta Saha</option><option>Forvet</option></select></div>
              </div>
              <div><label className="block text-xs text-slate-400 mb-1">Geçici Şifre Ataması *</label><input required type="text" placeholder="Oyuncu için şifre girin" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
              <button type="submit" className={`w-full mt-4 py-2 rounded font-bold ${THEME.primary} transition-colors`}>Kayıtlı Oyuncu Olarak Ekle</button>
            </form>
          </div>
        )}

        <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border} ${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b border-slate-700 pb-3"><Users className={THEME.accent} /> Oyuncu Havuzu ({approvedPlayers.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-3 rounded-tl-lg w-12 text-center">No</th>
                  <th className="p-3">Ad Soyad</th>
                  <th className="p-3">Pozisyon</th>
                  <th className="p-3">İletişim</th>
                  {isAdmin && <th className="p-3 text-center">Durum / Rol</th>}
                  {isAdmin && <th className="p-3 rounded-tr-lg text-center">İşlem</th>}
                </tr>
              </thead>
              <tbody>
                {approvedPlayers.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 6 : 4} className="p-4 text-center text-slate-500">Kayıtlı onaylı oyuncu yok.</td></tr>
                ) : (
                  approvedPlayers.map((p) => {
                    if (isAdmin && editingPlayer?.id === p.id) {
                      return (
                        <tr key={`edit-${p.id}`} className="border-b border-slate-700 bg-slate-800">
                          <td className="p-2 align-top text-center"><input type="number" className="w-12 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none text-center" value={editingPlayer.number} onChange={e => setEditingPlayer({...editingPlayer, number: e.target.value})} /></td>
                          <td className="p-2"><div className="flex gap-1"><input type="text" placeholder="Ad" className="w-1/2 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none" value={editingPlayer.firstName} onChange={e => setEditingPlayer({...editingPlayer, firstName: e.target.value})} /><input type="text" placeholder="Soyad" className="w-1/2 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none" value={editingPlayer.lastName} onChange={e => setEditingPlayer({...editingPlayer, lastName: e.target.value})} /></div></td>
                          <td className="p-2 align-top"><select className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none" value={editingPlayer.position} onChange={e => setEditingPlayer({...editingPlayer, position: e.target.value})}><option>Kaleci</option><option>Defans</option><option>Orta Saha</option><option>Forvet</option></select></td>
                          <td className="p-2 align-top"><input type="text" placeholder="Tel No" className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs outline-none" value={editingPlayer.phone || ''} onChange={e => setEditingPlayer({...editingPlayer, phone: e.target.value})} /></td>
                          <td colSpan="2" className="p-2 text-center align-top"><div className="flex gap-2 justify-center mt-1"><button onClick={saveEdit} className="text-green-400 hover:text-green-300 font-bold text-xs bg-green-900/40 px-3 py-1.5 rounded border border-green-700">Kaydet</button><button onClick={() => setEditingPlayer(null)} className="text-slate-400 hover:text-slate-300 font-bold text-xs bg-slate-700/80 px-3 py-1.5 rounded border border-slate-600">İptal</button></div></td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={p.id} className={`border-b border-slate-700 transition-colors ${p.isActive === false ? 'opacity-50 bg-slate-800' : 'hover:bg-slate-700/50'}`}>
                        <td className="p-3 font-mono text-cyan-400 text-center font-bold text-lg">{p.number || '-'}</td>
                        <td className="p-3">
                           <div className="font-semibold text-white flex items-center gap-2">
                             {/* Mini Avatar in table */}
                             {p.avatar && <img src={p.avatar} className="w-5 h-5 rounded-full object-cover border border-slate-600" />}
                             {p.firstName} {p.lastName} {p.role === 'master_admin' && <ShieldCheck size={14} className="text-yellow-400" title="Asıl Admin" />} {p.role === 'admin' && <Shield size={14} className="text-cyan-400" title="Admin" />}
                           </div>
                           <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                              {isAdmin && <span>ID: <span className="text-cyan-500 font-bold">{p.id}</span></span>}
                              {p.username && <span className="text-blue-300">@{p.username}</span>}
                           </div>
                        </td>
                        <td className="p-3"><span className={`px-2 py-1 rounded text-xs ${p.position === 'Kaleci' ? 'bg-yellow-600/20 text-yellow-400' : p.position === 'Defans' ? 'bg-blue-600/20 text-blue-400' : p.position === 'Orta Saha' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>{p.position}</span></td>
                        <td className="p-3 text-xs text-slate-400">{p.phone || '-'}</td>
                        {isAdmin && (<td className="p-3 text-center"><button onClick={() => togglePlayerStatus(p.id, p.isActive !== false)} disabled={p.role === 'master_admin'} className={`px-3 py-1 rounded text-xs font-bold transition-all ${p.isActive !== false ? 'bg-green-600/20 text-green-400 border border-green-500/50 hover:bg-green-600/40' : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'} disabled:opacity-30 disabled:cursor-not-allowed`}>{p.isActive !== false ? 'Aktif' : 'Pasif'}</button></td>)}
                        {isAdmin && (
                          <td className="p-3">
                            <div className="flex flex-col gap-2 items-center">
                              {deleteConfirmId === p.id ? (
                                <div className="flex gap-1 justify-center"><button onClick={() => confirmDelete(p.id)} className="text-red-400 hover:text-white font-bold text-[10px] bg-red-900/60 px-2 py-1 rounded">Onayla</button><button onClick={() => setDeleteConfirmId(null)} className="text-slate-300 hover:text-white font-bold text-[10px] bg-slate-700 px-2 py-1 rounded">İptal</button></div>
                              ) : (
                                <div className="flex gap-2 justify-center items-center"><button onClick={() => setEditingPlayer(p)} disabled={p.role === 'master_admin' && !isMasterAdmin} className="text-blue-400 hover:text-blue-300 p-1.5 bg-blue-900/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Düzenle"><Edit size={14} /></button><button onClick={() => setDeleteConfirmId(p.id)} disabled={p.role === 'master_admin' || (p.role === 'admin' && !isMasterAdmin)} className="text-red-400 hover:text-red-300 p-1.5 bg-red-900/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Sil"><Trash2 size={14} /></button></div>
                              )}
                              {p.role === 'user' && <button onClick={() => grantAdmin(p.id)} className="text-[10px] text-cyan-400 border border-cyan-700/50 bg-cyan-900/20 px-2 py-0.5 rounded hover:bg-cyan-800/40 w-full">Admin Yap</button>}
                              {p.role === 'admin' && isMasterAdmin && <button onClick={() => revokeAdmin(p.id)} className="text-[10px] text-orange-400 border border-orange-700/50 bg-orange-900/20 px-2 py-0.5 rounded hover:bg-orange-800/40 w-full">Yetkiyi Al</button>}
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
// 3. KADRO KURMA SEKRESİ (Sadece Adminler)
// ==========================================
function SquadTab({ players, matches }) {
  const [matchData, setMatchData] = useState({ date: '', time: '', stadium: '', teamAName: 'Ev Sahibi', teamBName: 'Deplasman' });
  const [pitchPlayers, setPitchPlayers] = useState([]);
  const [substitutes, setSubstitutes] = useState([]);
  const [notification, setNotification] = useState(null);

  const statsMap = getPlayerStatsMap(players, matches);

  // Mobil için Hızlı Tıklama ile Kadroya Alma
  const moveToPitch = (playerId, team) => {
    const x = team === 'A' ? 25 + Math.random() * 10 : 65 + Math.random() * 10;
    const y = 20 + Math.random() * 60;
    setPitchPlayers(prev => {
       const filtered = prev.filter(p => p.playerId !== playerId);
       return [...filtered, { playerId, x, y, team }];
    });
    setSubstitutes(prev => prev.filter(id => id !== playerId));
  };

  const moveToSubs = (playerId) => {
    if (!substitutes.includes(playerId)) setSubstitutes([...substitutes, playerId]);
    setPitchPlayers(prev => prev.filter(p => p.playerId !== playerId));
  };

  const removeFromSquad = (playerId) => {
    setPitchPlayers(prev => prev.filter(p => p.playerId !== playerId));
    setSubstitutes(prev => prev.filter(id => id !== playerId));
  };

  const handleDragStart = (e, playerId, source) => { e.dataTransfer.setData('playerId', playerId); e.dataTransfer.setData('source', source); };
  const handleDropOnPitch = (e, team) => { e.preventDefault(); const playerId = e.dataTransfer.getData('playerId'); if (!playerId) return; const rect = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - rect.left) / rect.width) * 100; const y = ((e.clientY - rect.top) / rect.height) * 100; setPitchPlayers(prev => { const filtered = prev.filter(p => p.playerId !== playerId); return [...filtered, { playerId, x, y, team }]; }); setSubstitutes(prev => prev.filter(id => id !== playerId)); };
  const handleDropOnSubs = (e) => { e.preventDefault(); const playerId = e.dataTransfer.getData('playerId'); if (!playerId) return; if (!substitutes.includes(playerId)) setSubstitutes([...substitutes, playerId]); setPitchPlayers(prev => prev.filter(p => p.playerId !== playerId)); };
  const handleDropToRemove = (e) => { e.preventDefault(); const playerId = e.dataTransfer.getData('playerId'); if (!playerId) return; removeFromSquad(playerId); };
  const updatePitchPlayerPosition = (playerId, x, y) => { setPitchPlayers(prev => prev.map(p => p.playerId === playerId ? { ...p, x, y, team: x <= 50 ? 'A' : 'B' } : p)); };
  
  // Çift Tıklama Mantığını Koru
  const handleDoubleClickPlayer = (playerId) => { const countA = pitchPlayers.filter(p => p.team === 'A').length; const countB = pitchPlayers.filter(p => p.team === 'B').length; moveToPitch(playerId, countA <= countB ? 'A' : 'B'); };

  const saveMatch = async () => {
    const errors = [];
    if (!matchData.date) errors.push("Tarih"); if (!matchData.time) errors.push("Saat"); if (!matchData.teamAName || matchData.teamAName.trim() === '') errors.push("Takım A İsmi"); if (!matchData.teamBName || matchData.teamBName.trim() === '') errors.push("Takım B İsmi"); if (pitchPlayers.length === 0) errors.push("Sahaya Oyuncu");
    if (errors.length > 0) { setNotification({ type: 'error', text: `Lütfen eksik bilgileri girin: ${errors.join(', ')}` }); setTimeout(() => setNotification(null), 5000); return; }

    const newMatch = {
      id: generateId(), ...matchData, stadium: matchData.stadium.trim() || 'Baykar Park', teamA: pitchPlayers.filter(p => p.team === 'A'), teamB: pitchPlayers.filter(p => p.team === 'B'), subs: substitutes, status: 'pending',
      scoreA: 0, scoreB: 0, events: [], ratings: {}, ratingsClosed: false 
    };

    await setDoc(doc(dbPath('matches'), newMatch.id), newMatch);
    setNotification({ type: 'success', text: 'Kadro başarıyla kaydedildi! Fikstürden maçı başlatabilirsiniz.' }); setTimeout(() => setNotification(null), 4000); setPitchPlayers([]); setSubstitutes([]); setMatchData({ date: '', time: '', stadium: '', teamAName: 'Ev Sahibi', teamBName: 'Deplasman' });
  };

  const availablePlayers = players.filter(p => p.status === 'approved' && p.isActive !== false && !pitchPlayers.find(pp => pp.playerId === p.id) && !substitutes.includes(p.id));

  return (
    <div className="space-y-6">
      {notification && <div className={`p-4 rounded-lg font-bold border shadow-lg transition-all ${notification.type === 'error' ? 'bg-red-900/50 text-red-400 border-red-500' : 'bg-green-900/50 text-green-400 border-green-500'}`}>{notification.text}</div>}
      <div className={`${THEME.panel} p-6 rounded-xl border ${THEME.border}`}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div><label className="block text-xs text-slate-400 mb-1">Maç Tarihi</label><input type="date" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={matchData.date} onChange={e => setMatchData({...matchData, date: e.target.value})} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Maç Saati</label><input type="time" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={matchData.time} onChange={e => setMatchData({...matchData, time: e.target.value})} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Stadyum</label><input type="text" placeholder="Baykar Park" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-cyan-400" value={matchData.stadium} onChange={e => setMatchData({...matchData, stadium: e.target.value})} /></div>
          <div><label className="block text-xs text-cyan-400 mb-1">Takım A İsmi</label><input type="text" className="w-full bg-blue-900/50 border border-blue-500 rounded p-2 text-white outline-none focus:border-cyan-400" value={matchData.teamAName} onChange={e => setMatchData({...matchData, teamAName: e.target.value})} /></div>
          <div><label className="block text-xs text-pink-400 mb-1">Takım B İsmi</label><input type="text" className="w-full bg-pink-900/50 border border-pink-500 rounded p-2 text-white outline-none focus:border-cyan-400" value={matchData.teamBName} onChange={e => setMatchData({...matchData, teamBName: e.target.value})} /></div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-4 flex flex-col">
          <div className={`${THEME.panel} p-4 rounded-xl border ${THEME.border} h-[360px] overflow-y-auto`}>
            <h3 className="font-bold text-sm mb-3 border-b border-slate-700 pb-2">Kullanılabilir ({availablePlayers.length})</h3>
            <p className="text-[10px] text-slate-500 mb-2 italic">Bilgisayarda sürükle, mobilde butonları kullan.</p>
            <div className="space-y-2">
              {availablePlayers.map(p => (
                <div key={p.id} draggable onDragStart={(e) => handleDragStart(e, p.id, 'pool')} onDoubleClick={() => handleDoubleClickPlayer(p.id)} className="bg-slate-900 p-2 rounded border border-slate-700 cursor-grab active:cursor-grabbing hover:border-cyan-400 flex flex-col sm:flex-row justify-between sm:items-center text-sm transition-colors gap-2 sm:gap-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono flex items-center gap-1 w-6">{p.avatar ? <img src={p.avatar} className="w-5 h-5 rounded-full object-cover"/> : `#${p.number}`}</span>
                    <div className="flex flex-col">
                      <span>{p.firstName} {p.lastName}</span>
                      <span className="text-[10px] text-yellow-400 flex items-center gap-1 mt-0.5"><Star size={10} fill="currentColor"/> {statsMap[p.id]?.avgRating > 0 ? statsMap[p.id].avgRating : 'Puan Yok'}</span>
                    </div>
                  </div>
                  {/* Mobil Butonlar */}
                  <div className="flex gap-1 justify-end">
                    <button type="button" onClick={() => moveToPitch(p.id, 'A')} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2 py-1 rounded">A</button>
                    <button type="button" onClick={() => moveToPitch(p.id, 'B')} className="bg-pink-600 hover:bg-pink-500 text-white text-[10px] px-2 py-1 rounded">B</button>
                    <button type="button" onClick={() => moveToSubs(p.id)} className="bg-yellow-600 hover:bg-yellow-500 text-white text-[10px] px-2 py-1 rounded">Yedek</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div id="subs-zone" className={`${THEME.panel} p-4 rounded-xl border-2 border-dashed ${THEME.border} h-40 overflow-y-auto bg-slate-800/50`} onDragOver={e => e.preventDefault()} onDrop={handleDropOnSubs}>
            <h3 className="font-bold text-sm mb-3 text-slate-400 text-center">Yedekler</h3>
            <div className="space-y-2">
              {substitutes.map(id => { 
                const p = players.find(player => player.id === id); 
                if(!p) return null; 
                return (
                  <div key={p.id} draggable onDragStart={(e) => handleDragStart(e, p.id, 'subs')} className="bg-slate-700 p-2 rounded cursor-grab flex flex-col sm:flex-row justify-between sm:items-center text-sm border border-yellow-600/30 gap-2 sm:gap-0">
                    <div className="flex items-center gap-2">
                       {p.avatar && <img src={p.avatar} className="w-5 h-5 rounded-full object-cover"/>}
                       <div className="flex flex-col">
                         <span>{p.firstName} {p.lastName}</span>
                         <span className="text-[10px] text-yellow-300 flex items-center gap-1 mt-0.5"><Star size={10} fill="currentColor"/> {statsMap[p.id]?.avgRating > 0 ? statsMap[p.id].avgRating : 'Puan Yok'}</span>
                       </div>
                    </div>
                    {/* Mobil Butonlar */}
                    <div className="flex gap-1 justify-end">
                      <button type="button" onClick={() => moveToPitch(p.id, 'A')} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2 py-1 rounded">A</button>
                      <button type="button" onClick={() => moveToPitch(p.id, 'B')} className="bg-pink-600 hover:bg-pink-500 text-white text-[10px] px-2 py-1 rounded">B</button>
                      <button type="button" onClick={() => removeFromSquad(p.id)} className="bg-red-600 hover:bg-red-500 text-white text-[10px] px-2 py-1 rounded">Çıkar</button>
                    </div>
                  </div>
                ); 
              })}
            </div>
          </div>
          <div id="trash-zone" className={`${THEME.panel} p-4 rounded-xl border-2 border-dashed border-red-500/50 bg-red-900/10 flex flex-col items-center justify-center text-red-400 h-24 transition-colors hover:bg-red-900/30 hidden md:flex`} onDragOver={e => e.preventDefault()} onDrop={handleDropToRemove}>
            <Trash2 size={24} className="mb-1 opacity-80" /><span className="text-sm font-bold">Kadrodan Çıkar (Sürükle)</span>
          </div>
        </div>
        <div className="lg:col-span-3">
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 shadow-2xl relative">
            <div className="pitch-container relative w-full aspect-[4/3] max-h-[600px] flex overflow-hidden border-4 border-white/80 rounded" style={{background: '#1a5928'}}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, #000 10%, #000 20%)'}}></div>
              <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-white/80 -ml-[2px] z-10"></div>
              <div className="absolute left-1/2 top-1/2 w-32 h-32 border-4 border-white/80 rounded-full -ml-16 -mt-16 z-10"></div>
              <div className="absolute left-1/2 top-1/2 w-3 h-3 bg-white/80 rounded-full -ml-[6px] -mt-[6px] z-10"></div>
              <div className="w-1/2 h-full relative z-20" onDragOver={e => e.preventDefault()} onDrop={e => handleDropOnPitch(e, 'A')}><div className="absolute left-0 top-1/2 -mt-24 w-32 h-48 border-4 border-l-0 border-white/80"></div><div className="absolute left-0 top-1/2 -mt-10 w-12 h-20 border-4 border-l-0 border-white/80"></div>{pitchPlayers.filter(p => p.team === 'A').map(pp => (<PitchPlayer key={pp.playerId} pp={pp} players={players} onDragStart={handleDragStart} teamColor="bg-blue-600 border-blue-300" onUpdatePosition={updatePitchPlayerPosition} onRemove={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id))}} onMoveToSubs={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id)); setSubstitutes(s => [...s, id])}} />))}</div>
              <div className="w-1/2 h-full relative z-20" onDragOver={e => e.preventDefault()} onDrop={e => handleDropOnPitch(e, 'B')}><div className="absolute right-0 top-1/2 -mt-24 w-32 h-48 border-4 border-r-0 border-white/80"></div><div className="absolute right-0 top-1/2 -mt-10 w-12 h-20 border-4 border-r-0 border-white/80"></div>{pitchPlayers.filter(p => p.team === 'B').map(pp => (<PitchPlayer key={pp.playerId} pp={pp} players={players} onDragStart={handleDragStart} teamColor="bg-pink-600 border-pink-300" onUpdatePosition={updatePitchPlayerPosition} onRemove={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id))}} onMoveToSubs={(id) => {setPitchPlayers(prev => prev.filter(p => p.playerId !== id)); setSubstitutes(s => [...s, id])}} />))}</div>
            </div>
            <div className="mt-6 flex justify-end"><button onClick={saveMatch} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-8 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all transform hover:scale-105"><Save size={20} /> Kadroyu ve Maçı Kaydet</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PitchPlayer = ({ pp, players, onDragStart, teamColor, onUpdatePosition, onRemove, onMoveToSubs }) => {
  const p = players.find(player => player.id === pp.playerId);
  const handleTouchMove = (e) => { e.stopPropagation(); const touch = e.touches[0]; const pitch = e.currentTarget.closest('.pitch-container'); if (!pitch) return; const rect = pitch.getBoundingClientRect(); let x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100)); let y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100)); onUpdatePosition(pp.playerId, x, y); };
  const handleTouchEnd = (e) => { const touch = e.changedTouches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY); if (target?.closest('#trash-zone')) onRemove(pp.playerId); else if (target?.closest('#subs-zone')) onMoveToSubs(pp.playerId); };
  if(!p) return null;
  return (
    <div draggable onDragStart={(e) => onDragStart(e, pp.playerId, `pitch${pp.team}`)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className="absolute cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group z-30" style={{ left: `${pp.x}%`, top: `${pp.y}%`, touchAction: 'none' }}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 overflow-hidden ${teamColor}`}>
        {p.avatar ? <img src={p.avatar} className="w-full h-full object-cover"/> : (p.number || p.firstName.charAt(0))}
      </div>
      <div className="bg-black/80 border border-slate-700/50 text-white text-[10px] px-1.5 py-0.5 rounded mt-1 whitespace-nowrap opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none">{p.firstName}</div>
    </div>
  );
};


// ==========================================
// 4. FİKSTÜR VE MAÇ YÖNETİMİ
// ==========================================
function FixturesTab({ matches, players, currentUserData, isAdmin, isMasterAdmin }) {
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [confirmEndMatchId, setConfirmEndMatchId] = useState(null);
  const [editingMatch, setEditingMatch] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null); 
  
  const sortedMatches = [...matches].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
  const selectedMatch = matches.find(m => m.id === selectedMatchId);

  const getPlayerName = (id) => {
    if (id === 'own_goal') return 'Kendi Kalesine';
    const p = players.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : 'Bilinmiyor';
  };

  // --- MAÇIN ADAMI HESAPLAMA MANTIĞI ---
  const getMatchMotm = (match) => {
    if (match.status !== 'completed' || !isRatingsClosedForMatch(match)) return null;
    let bestPlayer = null;
    let bestScore = -1;

    const allPlayers = [...match.teamA, ...match.teamB];
    const bannedRaters = getBannedRaters(match.ratings);

    allPlayers.forEach(p => {
        const avg = calcPlayerMatchRating(match, p.playerId, bannedRaters);
        if (avg !== null && avg > bestScore) {
            bestScore = avg;
            bestPlayer = { ...p, score: avg };
        }
    });

    if (bestPlayer) {
        return { player: players.find(x => x.id === bestPlayer.playerId), score: bestScore.toFixed(2) };
    }
    return null;
  };

  // --- YETKİLİ İŞLEMLERİ ---
  const updateMatchStatus = async (matchId, status) => {
    if (!isAdmin) return;
    await updateDoc(doc(dbPath('matches'), matchId), { status });
    if (status === 'completed') setConfirmEndMatchId(null);
  };

  const toggleRatingStatus = async (matchId, currentStatus) => {
    if (!isMasterAdmin) return;
    if (currentStatus) {
        await updateDoc(doc(dbPath('matches'), matchId), { ratingsClosed: false, forceOpen: true });
    } else {
        await updateDoc(doc(dbPath('matches'), matchId), { ratingsClosed: true, forceOpen: false });
    }
  };

  const handleDeleteMatch = async (matchId) => {
    if (!isAdmin) return;
    if (window.confirm("Bu maçı silmek istediğinize emin misiniz? Fikstürden tamamen kalkacak.")) {
      await deleteDoc(doc(dbPath('matches'), matchId));
      setSelectedMatchId(null);
    }
  };

  const saveMatchEdit = async () => {
    if (!isAdmin) return;
    await updateDoc(doc(dbPath('matches'), editingMatch.id), {
      date: editingMatch.date,
      time: editingMatch.time,
      stadium: editingMatch.stadium || 'Baykar Park',
      teamAName: editingMatch.teamAName,
      teamBName: editingMatch.teamBName
    });
    setEditingMatch(null);
  };

  // --- GOL VE ASİST ---
  const handleAddGoal = async (teamScored, scorerId, assistId) => {
    if (!isAdmin) return;
    const newEvents = [...selectedMatch.events];
    const scoreAAtTime = newEvents.filter(e => e.team === 'A').length + (teamScored === 'A' ? 1 : 0);
    const scoreBAtTime = newEvents.filter(e => e.team === 'B').length + (teamScored === 'B' ? 1 : 0);
    newEvents.push({ id: generateId(), type: 'goal', team: teamScored, scorerId, assistId, scoreAAtTime, scoreBAtTime });
    await updateDoc(doc(dbPath('matches'), selectedMatch.id), { events: newEvents, scoreA: scoreAAtTime, scoreB: scoreBAtTime });
  };

  const saveEventEdit = async () => {
    if (!isAdmin || !editingEvent || !editingEvent.scorerId) return;
    const newEvents = selectedMatch.events.map(e => 
      e.id === editingEvent.id 
        ? { ...e, scorerId: editingEvent.scorerId, assistId: editingEvent.assistId === 'none' ? null : editingEvent.assistId } 
        : e
    );
    await updateDoc(doc(dbPath('matches'), selectedMatch.id), { events: newEvents });
    setEditingEvent(null);
  };

  const deleteEvent = async (eventId) => {
    if (!isAdmin) return;
    if (!window.confirm("Bu golü silmek istediğinize emin misiniz? Maç skoru yeniden hesaplanacaktır.")) return;
    
    const newEvents = selectedMatch.events.filter(e => e.id !== eventId);
    let newScoreA = 0; let newScoreB = 0;
    
    const recalculatedEvents = newEvents.map(e => {
       if (e.team === 'A') newScoreA++;
       if (e.team === 'B') newScoreB++;
       return { ...e, scoreAAtTime: newScoreA, scoreBAtTime: newScoreB };
    });
    
    await updateDoc(doc(dbPath('matches'), selectedMatch.id), { events: recalculatedEvents, scoreA: newScoreA, scoreB: newScoreB });
  };

  const ratingsAreClosed = isRatingsClosedForMatch(selectedMatch);

  // --- PUANLAMA İŞLEMLERİ ---
  const handleRatingChange = async (playerId, val) => {
    if (ratingsAreClosed) return; 
    if (playerId === currentUserData.id) return; // Kendi kendine puan veremez

    const numVal = Number(val);
    if (numVal < 1 || numVal > 10) return;
    const newRatings = { ...selectedMatch.ratings };
    if (!newRatings[playerId]) newRatings[playerId] = {};
    newRatings[playerId][currentUserData.id] = numVal;
    await updateDoc(doc(dbPath('matches'), selectedMatch.id), { ratings: newRatings });
  };

  const handleForceRatingChange = async (targetPlayerId, raterId, val) => {
    if (!isMasterAdmin) return;
    const numVal = Number(val);
    const newRatings = { ...selectedMatch.ratings };
    if (!newRatings[targetPlayerId]) newRatings[targetPlayerId] = {};
    
    if (val === '') {
        delete newRatings[targetPlayerId][raterId];
    } else if (numVal >= 1 && numVal <= 10) {
        newRatings[targetPlayerId][raterId] = numVal;
    } else {
        return;
    }
    await updateDoc(doc(dbPath('matches'), selectedMatch.id), { ratings: newRatings });
  };

  const myTeam = selectedMatch?.teamA.some(p => p.playerId === currentUserData.id) ? 'A' :
                 selectedMatch?.teamB.some(p => p.playerId === currentUserData.id) ? 'B' : null;

  const canRatePlayer = (playerId) => {
    if (ratingsAreClosed) return false;
    if (playerId === currentUserData.id) return false;
    if (!myTeam) return false;
    return true;
  };

  const bannedRatersForCurrentMatch = selectedMatch ? getBannedRaters(selectedMatch.ratings) : [];

  const getAverageRating = (playerId) => {
    const avg = calcPlayerMatchRating(selectedMatch, playerId, bannedRatersForCurrentMatch);
    if (avg === null) return null;
    return avg.toFixed(2);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <h2 className="text-xl font-bold border-b border-slate-700 pb-2">Maçlar</h2>
        {sortedMatches.length === 0 ? <p className="text-slate-500">Kayıtlı maç yok.</p> : null}
        
        {sortedMatches.map(m => {
          const motm = getMatchMotm(m);
          return (
            <div key={m.id} onClick={() => setSelectedMatchId(m.id)}
              className={`${THEME.panel} p-4 rounded-xl border ${selectedMatch?.id === m.id ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : THEME.border} cursor-pointer hover:bg-slate-700 transition-all`}
            >
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>{m.date} - {m.time}</span>
                <span className="truncate ml-2 text-right">📍 {m.stadium || 'Baykar Park'}</span>
              </div>
              <div className="flex items-center justify-between font-bold">
                <span className="text-blue-400 truncate w-1/3">{m.teamAName}</span>
                <div className="bg-slate-900 px-3 py-1 rounded-full text-lg shadow-inner">
                  {m.scoreA} - {m.scoreB}
                </div>
                <span className="text-pink-400 truncate w-1/3 text-right">{m.teamBName}</span>
              </div>
              <div className="mt-3 text-center text-xs flex items-center justify-center gap-2">
                {m.status === 'pending' && <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">Başlamadı</span>}
                {m.status === 'active' && <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded animate-pulse">Oynanıyor</span>}
                {m.status === 'completed' && <span className="bg-slate-600/50 text-slate-300 px-2 py-1 rounded">Tamamlandı</span>}
              </div>
              
              {/* MAÇIN ADAMI GÖSTERİMİ */}
              {motm && (
                <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-center gap-3">
                   <div className="flex flex-col text-right">
                      <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-widest flex items-center gap-1 justify-end"><Star size={10} fill="currentColor"/> Maçın Adamı</span>
                      <span className="text-sm font-bold text-white">{motm.player.firstName} {motm.player.lastName}</span>
                   </div>
                   <div className="w-10 h-10 rounded-full border-2 border-yellow-400 bg-slate-800 overflow-hidden flex items-center justify-center shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                       {motm.player.avatar ? <img src={motm.player.avatar} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-yellow-400">{motm.player.number}</span>}
                   </div>
                   <div className="text-xl font-black text-yellow-400">{motm.score}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="lg:col-span-2">
        {selectedMatch ? (
          <div className={`${THEME.panel} p-6 rounded-xl border border-cyan-500/30 shadow-2xl`}>
            
            {/* Admin Maç Düzenleme / Silme Barı */}
            {isAdmin && (
              <div className="flex justify-end gap-2 mb-4 border-b border-slate-700 pb-4">
                <button onClick={() => setEditingMatch(selectedMatch)} className="bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded flex items-center gap-2 text-xs font-bold transition-colors">
                  <Edit size={14} /> Maçı Düzenle
                </button>
                <button onClick={() => handleDeleteMatch(selectedMatch.id)} className="bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded flex items-center gap-2 text-xs font-bold transition-colors">
                  <Trash2 size={14} /> Maçı Sil
                </button>
              </div>
            )}

            {/* Düzenleme Formu (Aktifse) */}
            {editingMatch?.id === selectedMatch.id ? (
               <div className="bg-slate-900 p-4 rounded-lg border border-blue-500/50 mb-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="block text-xs text-slate-400 mb-1">Tarih</label><input type="date" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white outline-none focus:border-cyan-400 text-sm" value={editingMatch.date} onChange={e => setEditingMatch({...editingMatch, date: e.target.value})} /></div>
                    <div><label className="block text-xs text-slate-400 mb-1">Saat</label><input type="time" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white outline-none focus:border-cyan-400 text-sm" value={editingMatch.time} onChange={e => setEditingMatch({...editingMatch, time: e.target.value})} /></div>
                    <div><label className="block text-xs text-slate-400 mb-1">Stadyum</label><input type="text" placeholder="Baykar Park" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white outline-none focus:border-cyan-400 text-sm" value={editingMatch.stadium || ''} onChange={e => setEditingMatch({...editingMatch, stadium: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs text-slate-400 mb-1">Takım A İsmi</label><input type="text" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white outline-none focus:border-cyan-400 text-sm" value={editingMatch.teamAName} onChange={e => setEditingMatch({...editingMatch, teamAName: e.target.value})} /></div>
                    <div><label className="block text-xs text-slate-400 mb-1">Takım B İsmi</label><input type="text" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white outline-none focus:border-cyan-400 text-sm" value={editingMatch.teamBName} onChange={e => setEditingMatch({...editingMatch, teamBName: e.target.value})} /></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingMatch(null)} className="text-slate-300 hover:text-white font-bold text-xs bg-slate-700 px-4 py-2 rounded">İptal</button>
                    <button onClick={saveMatchEdit} className="text-green-400 hover:text-green-300 font-bold text-xs bg-green-900/40 px-4 py-2 rounded border border-green-700 flex items-center gap-1"><Check size={14} /> Kaydet</button>
                  </div>
               </div>
            ) : (
              <div className="text-center mb-8">
                <div className="text-sm text-slate-400 mb-2">{selectedMatch.date} - {selectedMatch.time} | 📍 {selectedMatch.stadium || 'Baykar Park'}</div>
                <div className="flex justify-center items-center gap-8 text-3xl font-black">
                  <div className="text-blue-400">{selectedMatch.teamAName}</div>
                  <div className="bg-slate-900 px-6 py-2 rounded-xl border border-slate-700 shadow-inner">
                    {selectedMatch.scoreA} : {selectedMatch.scoreB}
                  </div>
                  <div className="text-pink-400">{selectedMatch.teamBName}</div>
                </div>
                
                {isAdmin && selectedMatch.status === 'pending' && (
                  <button onClick={() => updateMatchStatus(selectedMatch.id, 'active')} 
                    className="mt-6 bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-full font-bold flex items-center justify-center gap-2 mx-auto transition-transform hover:scale-105 shadow-lg">
                    <Play size={18} /> Maçı Başlat
                  </button>
                )}
              </div>
            )}

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

                {/* Timeline (Maç Olayları) */}
                {selectedMatch.events.length > 0 && (
                  <div className="mt-8 mb-6">
                    <h3 className="font-bold text-sm mb-6 border-b border-slate-700 pb-2 text-center text-slate-400 uppercase tracking-widest">Maç Olayları</h3>
                    <div className="relative w-full flex flex-col items-center">
                      <div className="absolute top-0 bottom-0 w-px bg-slate-600 left-1/2 transform -translate-x-1/2"></div>
                      {selectedMatch.events.map((ev, idx) => {
                        const scoreDisplay = ev.scoreAAtTime !== undefined ? `${ev.scoreAAtTime} - ${ev.scoreBAtTime}` : '? - ?';
                        
                        // GOL DÜZENLEME EKRANI
                        if (editingEvent?.id === ev.id) {
                          const teamPlayers = selectedMatch[`team${ev.team}`].map(tp => players.find(p => p.id === tp.playerId)).filter(Boolean);
                          return (
                            <div key={ev.id} className="w-full bg-slate-800 p-3 rounded-lg border border-cyan-500 my-2 flex flex-col gap-2 z-30 max-w-md mx-auto shadow-lg">
                              <div className="text-cyan-400 font-bold text-xs mb-1">Golü Düzenle ({ev.team === 'A' ? selectedMatch.teamAName : selectedMatch.teamBName})</div>
                              <div className="flex gap-2">
                                <select className="flex-1 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs" value={editingEvent.scorerId} onChange={e => setEditingEvent({...editingEvent, scorerId: e.target.value})}>
                                  <option value="own_goal">Kendi Kalesine</option>
                                  {teamPlayers.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                </select>
                                <select className="flex-1 bg-slate-900 border border-slate-600 rounded p-1 text-white text-xs" value={editingEvent.assistId || 'none'} onChange={e => setEditingEvent({...editingEvent, assistId: e.target.value})} disabled={editingEvent.scorerId === 'own_goal'}>
                                  <option value="none">Asist Yok</option>
                                  {teamPlayers.filter(p => p.id !== editingEvent.scorerId).map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                </select>
                              </div>
                              <div className="flex gap-2 justify-end mt-1">
                                <button onClick={() => setEditingEvent(null)} className="text-slate-400 hover:text-white text-xs px-3 py-1 bg-slate-700 rounded">İptal</button>
                                <button onClick={saveEventEdit} className="text-green-400 hover:text-green-300 text-xs px-3 py-1 bg-green-900/40 border border-green-700 rounded font-bold">Kaydet</button>
                              </div>
                            </div>
                          );
                        }

                        // NORMAL GOL GÖSTERİMİ
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
                                  {isAdmin && (
                                    <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => setEditingEvent(ev)} className="text-blue-400 hover:text-blue-300"><Edit size={12} /></button>
                                      <button onClick={() => deleteEvent(ev.id)} className="text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                                    </div>
                                  )}
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
                                  {isAdmin && (
                                    <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => setEditingEvent(ev)} className="text-blue-400 hover:text-blue-300"><Edit size={12} /></button>
                                      <button onClick={() => deleteEvent(ev.id)} className="text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                                    </div>
                                  )}
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
                   <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2">
                     <h3 className="font-bold text-sm text-slate-300 flex items-center gap-2">
                       Ortalama Oyuncu Puanları
                       {ratingsAreClosed && <Lock size={14} className="text-red-400" title="Puanlama Kapalı" />}
                       {!ratingsAreClosed && <Unlock size={14} className="text-green-400" title="Puanlama Açık" />}
                     </h3>
                     
                     {/* Asıl Admin İçin Puanlama Aç/Kapat Butonu */}
                     {isMasterAdmin && (
                        <button onClick={() => toggleRatingStatus(selectedMatch.id, ratingsAreClosed)} 
                          className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded transition-colors ${ratingsAreClosed ? 'bg-green-900/40 text-green-400 hover:bg-green-600 hover:text-white' : 'bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white'}`}>
                          {ratingsAreClosed ? <><Unlock size={14}/> Puanlamayı Aç</> : <><Lock size={14}/> Puanlamayı Bitir</>}
                        </button>
                     )}
                   </div>

                   {!ratingsAreClosed && myTeam && (
                     <div className="text-xs text-cyan-400 mb-4 bg-cyan-900/20 p-2 rounded border border-cyan-800">
                       Bilgi: Kendi takımın ve karşı takım için 1-10 arası puan girebilirsin. Kendine puan veremezsin. Puanlama "Puanlamayı Bitir" butonuna basılana veya ertesi gün saat 12:00 olana kadar devam eder.
                     </div>
                   )}
                   {ratingsAreClosed && (
                     <div className="text-xs text-slate-400 mb-4 bg-slate-900/50 p-2 rounded border border-slate-800">
                       Puanlama sonlandırılmıştır. Yeni puan girilemez. <br/>
                       <span className="text-green-400 font-bold">Gol ve asistler puana +0.01 ekler.</span>
                     </div>
                   )}

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Takım A */}
                      <div className="space-y-3 border-r border-slate-700 pr-4">
                        <div className="text-blue-400 font-bold text-sm mb-2">{selectedMatch.teamAName}</div>
                        {selectedMatch.teamA.map(p => {
                          const avg = getAverageRating(p.playerId);
                          const myRating = selectedMatch.ratings[p.playerId]?.[currentUserData.id] || '';
                          const canRate = canRatePlayer(p.playerId);
                          
                          const ratingData = getTrimmedRatingData(selectedMatch.ratings[p.playerId], p.playerId, bannedRatersForCurrentMatch);
                          const allMatchPlayers = [...selectedMatch.teamA, ...selectedMatch.teamB];
                          const playerInfo = players.find(x => x.id === p.playerId);

                          return (
                            <div key={p.playerId} className="bg-slate-900/30 p-2 rounded flex flex-col justify-center">
                              <div className="flex justify-between items-center text-sm">
                                <span className="truncate w-32 font-medium flex items-center gap-1">
                                    {playerInfo?.avatar && <img src={playerInfo.avatar} className="w-5 h-5 rounded-full object-cover"/>}
                                    {getPlayerName(p.playerId)}
                                </span>
                                <div className="flex items-center gap-2">
                                  {/* Asıl admin ortalamayı her zaman görebilir, diğerleri sadece kapandığında */}
                                  <span className="text-xs font-mono font-bold text-yellow-400 w-10 text-right">
                                     {(ratingsAreClosed || isMasterAdmin) ? (avg ? avg : '-') : '?'}
                                  </span>
                                  {canRate && (
                                    <input type="number" min="1" max="10" step="1" placeholder="Puan"
                                      className="w-14 bg-slate-900 border border-slate-600 rounded p-1 text-center text-white text-xs outline-none focus:border-cyan-400"
                                      value={myRating} onChange={(e) => handleRatingChange(p.playerId, e.target.value)} />
                                  )}
                                </div>
                              </div>
                              {/* ASIL ADMIN İÇİN DETAYLI PUAN GÖSTERİMİ VE DÜZENLEME */}
                              {isMasterAdmin && (
                                <div className="text-[10px] text-slate-500 mt-2 border-t border-slate-700/50 pt-2 space-y-1">
                                  <div className="font-bold text-slate-400 mb-1 flex justify-between"><span>Tüm Oylamalar:</span> <span className="text-[8px] text-cyan-500">Değiştirebilirsin</span></div>
                                  <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                                    {allMatchPlayers.filter(mp => mp.playerId !== p.playerId).map(mp => {
                                      const raterId = mp.playerId;
                                      const score = selectedMatch.ratings[p.playerId]?.[raterId] || '';
                                      
                                      const isBanned = bannedRatersForCurrentMatch.includes(raterId);
                                      const isExcludedMin = raterId === ratingData.excludedMinRater;
                                      const isExcludedMax = raterId === ratingData.excludedMaxRater;
                                      
                                      let textColor = "text-yellow-400";
                                      if (score !== '') {
                                          if (isBanned) textColor = "text-blue-400"; // Mavi Kuralı
                                          else if (isExcludedMax) textColor = "text-green-400";
                                          else if (isExcludedMin) textColor = "text-red-400";
                                      }

                                      return (
                                        <div key={raterId} className="flex justify-between items-center bg-slate-950 p-1 rounded border border-slate-800">
                                           <span className={`truncate flex-1 pl-1 ${score === '' ? 'text-slate-600' : 'text-slate-300'}`}>{getPlayerName(raterId)}</span>
                                           <input type="number" min="1" max="10" 
                                                  className={`w-10 bg-slate-800 font-bold border border-slate-600 rounded text-center outline-none focus:border-cyan-400 ${textColor}`} 
                                                  value={score} 
                                                  onChange={(e) => handleForceRatingChange(p.playerId, raterId, e.target.value)} 
                                                  placeholder="-" />
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {(ratingData.excludedMaxRater || ratingData.excludedMinRater || bannedRatersForCurrentMatch.length > 0) && (
                                    <div className="text-[8px] text-slate-500 flex flex-col px-1 mt-1">
                                       <span className="text-green-400">Yeşil: Ortalamadan +2 Fazla (İptal)</span>
                                       <span className="text-red-400">Kırmızı: En Düşük (İptal)</span>
                                       <span className="text-blue-400">Mavi: Ortalaması 9'u Geçen (İptal)</span>
                                    </div>
                                  )}
                                </div>
                              )}
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
                           const canRate = canRatePlayer(p.playerId);
                           
                           const ratingData = getTrimmedRatingData(selectedMatch.ratings[p.playerId], p.playerId, bannedRatersForCurrentMatch);
                           const allMatchPlayers = [...selectedMatch.teamA, ...selectedMatch.teamB];
                           const playerInfo = players.find(x => x.id === p.playerId);

                           return (
                            <div key={p.playerId} className="bg-slate-900/30 p-2 rounded flex flex-col justify-center">
                              <div className="flex justify-between items-center text-sm">
                                <span className="truncate w-32 font-medium flex items-center gap-1">
                                    {playerInfo?.avatar && <img src={playerInfo.avatar} className="w-5 h-5 rounded-full object-cover"/>}
                                    {getPlayerName(p.playerId)}
                                </span>
                                <div className="flex items-center gap-2">
                                  {/* Asıl admin ortalamayı her zaman görebilir, diğerleri sadece kapandığında */}
                                  <span className="text-xs font-mono font-bold text-yellow-400 w-10 text-right">
                                     {(ratingsAreClosed || isMasterAdmin) ? (avg ? avg : '-') : '?'}
                                  </span>
                                  {canRate && (
                                    <input type="number" min="1" max="10" step="1" placeholder="Puan"
                                      className="w-14 bg-slate-900 border border-slate-600 rounded p-1 text-center text-white text-xs outline-none focus:border-cyan-400"
                                      value={myRating} onChange={(e) => handleRatingChange(p.playerId, e.target.value)} />
                                  )}
                                </div>
                              </div>
                              {/* ASIL ADMIN İÇİN DETAYLI PUAN GÖSTERİMİ VE DÜZENLEME */}
                              {isMasterAdmin && (
                                <div className="text-[10px] text-slate-500 mt-2 border-t border-slate-700/50 pt-2 space-y-1">
                                  <div className="font-bold text-slate-400 mb-1 flex justify-between"><span>Tüm Oylamalar:</span> <span className="text-[8px] text-cyan-500">Değiştirebilirsin</span></div>
                                  <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                                    {allMatchPlayers.filter(mp => mp.playerId !== p.playerId).map(mp => {
                                      const raterId = mp.playerId;
                                      const score = selectedMatch.ratings[p.playerId]?.[raterId] || '';
                                      
                                      const isBanned = bannedRatersForCurrentMatch.includes(raterId);
                                      const isExcludedMin = raterId === ratingData.excludedMinRater;
                                      const isExcludedMax = raterId === ratingData.excludedMaxRater;
                                      
                                      let textColor = "text-yellow-400";
                                      if (score !== '') {
                                          if (isBanned) textColor = "text-blue-400";
                                          else if (isExcludedMax) textColor = "text-green-400";
                                          else if (isExcludedMin) textColor = "text-red-400";
                                      }

                                      return (
                                        <div key={raterId} className="flex justify-between items-center bg-slate-950 p-1 rounded border border-slate-800">
                                           <span className={`truncate flex-1 pl-1 ${score === '' ? 'text-slate-600' : 'text-slate-300'}`}>{getPlayerName(raterId)}</span>
                                           <input type="number" min="1" max="10" 
                                                  className={`w-10 bg-slate-800 font-bold border border-slate-600 rounded text-center outline-none focus:border-cyan-400 ${textColor}`} 
                                                  value={score} 
                                                  onChange={(e) => handleForceRatingChange(p.playerId, raterId, e.target.value)} 
                                                  placeholder="-" />
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {(ratingData.excludedMaxRater || ratingData.excludedMinRater || bannedRatersForCurrentMatch.length > 0) && (
                                    <div className="text-[8px] text-slate-500 flex flex-col px-1 mt-1">
                                       <span className="text-green-400">Yeşil: Ortalamadan +2 Fazla (İptal)</span>
                                       <span className="text-red-400">Kırmızı: En Düşük (İptal)</span>
                                       <span className="text-blue-400">Mavi: Ortalaması 9'u Geçen (İptal)</span>
                                    </div>
                                  )}
                                </div>
                              )}
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
                      <p className="text-white font-bold mb-4">Maçı bitirmek istediğinize emin misiniz? (Not: Puanlama için ayrıca "Puanlamayı Bitir" yapmalısınız)</p>
                      <div className="flex justify-center gap-4">
                        <button onClick={() => updateMatchStatus(selectedMatch.id, 'completed')} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Evet, Maçı Bitir</button>
                        <button onClick={() => setConfirmEndMatchId(null)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-bold">İptal</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmEndMatchId(selectedMatch.id)} className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg font-bold mt-4 shadow-lg transition-colors">Maçı Bitir</button>
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

  const submit = () => { if(!scorer) return; onAddGoal(scorer, assist === 'none' ? null : assist); setScorer(''); setAssist(''); };
  const handleScorerChange = (e) => { const newScorer = e.target.value; setScorer(newScorer); if (assist === newScorer) setAssist(''); };

  return (
    <div className={`p-3 rounded border ${team === 'A' ? 'border-blue-900 bg-blue-900/10' : 'border-pink-900 bg-pink-900/10'}`}>
      <div className={`text-xs font-bold mb-2 ${team === 'A' ? 'text-blue-400' : 'text-pink-400'}`}>{match[`team${team}Name`]}</div>
      <select className="w-full text-sm bg-slate-800 border border-slate-600 rounded p-1 mb-2 text-white outline-none" value={scorer} onChange={handleScorerChange}>
        <option value="">Golü Atan Seç...</option><option value="own_goal">Kendi Kalesine</option>
        {teamPlayers.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
      </select>
      <select className="w-full text-sm bg-slate-800 border border-slate-600 rounded p-1 mb-2 text-white outline-none" value={assist} onChange={e => setAssist(e.target.value)} disabled={scorer === 'own_goal'}>
        <option value="">Asist Yapan (Yoksa boş bırak)</option><option value="none">Asist Yok</option>
        {teamPlayers.filter(p => p.id !== scorer).map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
      </select>
      <button onClick={submit} className="w-full bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded text-white font-bold transition-colors">Ekle</button>
    </div>
  );
};


// ==========================================
// 5. İSTATİSTİKLER SEKRESİ
// ==========================================
function StatsTab({ players, matches }) {
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState(null);

  const completedMatches = matches.filter(m => m.status === 'completed');
  const totalMatches = completedMatches.length;
  let totalGoals = 0;
  
  completedMatches.forEach(m => { totalGoals += m.scoreA + m.scoreB; });

  const statsMap = getPlayerStatsMap(players, matches);
  const statsArray = Object.values(statsMap).filter(s => s.matches > 0);
  
  const topScorers = [...statsArray].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topAssists = [...statsArray].sort((a, b) => b.assists - a.assists).slice(0, 5);
  const topRatings = [...statsArray].sort((a, b) => b.avgRating - a.avgRating).slice(0, 10);

  return (
    <div className="space-y-8">
      {/* OYUNCU DETAY MODALI (Tıklanınca Açılır) */}
      {selectedPlayerForStats && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4" onClick={() => setSelectedPlayerForStats(null)}>
          <div className="bg-slate-900 border border-cyan-500/50 p-6 rounded-2xl max-w-sm w-full relative shadow-[0_0_30px_rgba(34,211,238,0.2)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedPlayerForStats(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
            
            <div className="flex flex-col items-center mb-6 mt-2">
               <div className="w-20 h-20 rounded-full border-2 border-cyan-400 overflow-hidden mb-3 shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                  {selectedPlayerForStats.avatar ? <img src={selectedPlayerForStats.avatar} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-slate-800 flex items-center justify-center text-3xl font-black text-cyan-400">{selectedPlayerForStats.number}</div>}
               </div>
               <h3 className="text-xl font-bold text-white">{selectedPlayerForStats.name}</h3>
               <span className="text-xs font-mono text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded mt-1 border border-cyan-800">Forma No: #{selectedPlayerForStats.number}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-6">
               <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Galibiyet</div><div className="text-lg font-black text-green-400">{selectedPlayerForStats.wins}</div>
               </div>
               <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Beraberlik</div><div className="text-lg font-black text-yellow-400">{selectedPlayerForStats.draws}</div>
               </div>
               <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Mağlubiyet</div><div className="text-lg font-black text-red-400">{selectedPlayerForStats.losses}</div>
               </div>
            </div>
            
            <div className="flex justify-between bg-slate-800 p-3 rounded-lg border border-slate-700 mb-6">
               <div className="text-center w-1/3 border-r border-slate-700"><div className="text-xs text-slate-400">Maç</div><div className="text-xl font-bold text-white">{selectedPlayerForStats.matches}</div></div>
               <div className="text-center w-1/3 border-r border-slate-700"><div className="text-xs text-slate-400">Gol</div><div className="text-xl font-bold text-cyan-400">{selectedPlayerForStats.goals}</div></div>
               <div className="text-center w-1/3"><div className="text-xs text-slate-400">Asist</div><div className="text-xl font-bold text-pink-400">{selectedPlayerForStats.assists}</div></div>
            </div>

            <div>
               <h4 className="text-sm font-bold text-slate-300 mb-2 border-b border-slate-700 pb-1 flex justify-between items-center">
                  <span>Son 5 Maç Puanı</span>
                  <span className="text-xs font-mono text-yellow-400">Ort: {selectedPlayerForStats.avgRating}</span>
               </h4>
               <div className="space-y-2">
                  {selectedPlayerForStats.matchHistory.length === 0 ? <div className="text-xs text-slate-500 text-center py-2">Puan verisi yok.</div> : null}
                  {selectedPlayerForStats.matchHistory.slice(-5).reverse().map((h, i) => (
                     <div key={i} className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50">
                        <span className="text-xs text-slate-400 flex items-center gap-2"><CalendarDays size={12}/> {h.date}</span>
                        <span className="text-sm font-black text-yellow-400 flex items-center gap-1">{h.rating} <Star size={12} fill="currentColor"/></span>
                     </div>
                  ))}
               </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-2xl border border-blue-500/30 text-center shadow-lg"><div className="text-4xl font-black text-white mb-1">{totalMatches}</div><div className="text-sm text-blue-300 font-semibold uppercase tracking-wider">Oynanan Maç</div></div>
        <div className="bg-gradient-to-br from-cyan-900 to-slate-900 p-6 rounded-2xl border border-cyan-500/30 text-center shadow-lg"><div className="text-4xl font-black text-white mb-1">{totalGoals}</div><div className="text-sm text-cyan-300 font-semibold uppercase tracking-wider">Atılan Gol</div></div>
        <div className="bg-gradient-to-br from-pink-900 to-slate-900 p-6 rounded-2xl border border-pink-500/30 text-center shadow-lg"><div className="text-4xl font-black text-white mb-1">{totalMatches > 0 ? (totalGoals/totalMatches).toFixed(1) : 0}</div><div className="text-sm text-pink-300 font-semibold uppercase tracking-wider">Maç Başı Gol</div></div>
        <div className="bg-gradient-to-br from-purple-900 to-slate-900 p-6 rounded-2xl border border-purple-500/30 text-center shadow-lg"><div className="text-4xl font-black text-white mb-1">{players.filter(p=>p.status==='approved').length}</div><div className="text-sm text-purple-300 font-semibold uppercase tracking-wider">Onaylı Oyuncu</div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className={`${THEME.panel} p-6 rounded-xl border border-yellow-500/30`}>
          <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2 border-b border-slate-700 pb-2"><Goal size={20} /> Gol Krallığı</h3>
          <ul className="space-y-3">
            {topScorers.map((s, idx) => (
              <li key={s.id} onClick={() => setSelectedPlayerForStats(s)} className="flex justify-between items-center bg-slate-900/50 p-2 rounded cursor-pointer hover:bg-slate-700 transition-colors">
                 <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-bold w-4">{idx + 1}.</span>
                    {s.avatar && <img src={s.avatar} className="w-8 h-8 rounded-full object-cover border border-slate-600"/>}
                    <div><div className="font-bold">{s.name}</div><div className="text-[10px] text-slate-400">{s.matches} maçta</div></div>
                 </div>
                 <div className="text-xl font-black text-yellow-400">{s.goals}</div>
              </li>
            ))}
            {topScorers.length === 0 && <p className="text-sm text-slate-500 text-center">Henüz veri yok</p>}
          </ul>
        </div>

        <div className={`${THEME.panel} p-6 rounded-xl border border-cyan-500/30`}>
          <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2 border-b border-slate-700 pb-2"><Users size={20} /> Asist Krallığı</h3>
          <ul className="space-y-3">
            {topAssists.map((s, idx) => (
              <li key={s.id} onClick={() => setSelectedPlayerForStats(s)} className="flex justify-between items-center bg-slate-900/50 p-2 rounded cursor-pointer hover:bg-slate-700 transition-colors">
                 <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-bold w-4">{idx + 1}.</span>
                    {s.avatar && <img src={s.avatar} className="w-8 h-8 rounded-full object-cover border border-slate-600"/>}
                    <div><div className="font-bold">{s.name}</div><div className="text-[10px] text-slate-400">{s.matches} maçta</div></div>
                 </div>
                 <div className="text-xl font-black text-cyan-400">{s.assists}</div>
              </li>
            ))}
             {topAssists.length === 0 && <p className="text-sm text-slate-500 text-center">Henüz veri yok</p>}
          </ul>
        </div>

        <div className={`${THEME.panel} p-6 rounded-xl border border-blue-500/30 lg:col-span-1 md:col-span-2`}>
          <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2 border-b border-slate-700 pb-2"><Star size={20} /> En Yüksek Puan Ortalaması</h3>
          <ul className="space-y-3">
            {topRatings.filter(r => r.avgRating > 0).map((s, idx) => (
              <li key={s.id} onClick={() => setSelectedPlayerForStats(s)} className="flex justify-between items-center bg-slate-900/50 p-2 rounded border-l-2 border-blue-500 cursor-pointer hover:bg-slate-700 transition-colors">
                 <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-bold w-4">{idx + 1}.</span>
                    {s.avatar && <img src={s.avatar} className="w-8 h-8 rounded-full object-cover border border-slate-600"/>}
                    <div><div className="font-bold">{s.name}</div><div className="text-[10px] text-slate-400">{s.matches} maç oynadı</div></div>
                 </div>
                 <div className="flex flex-col items-end">
                    <div className="text-lg font-black text-blue-300">{s.avgRating}</div>
                    <div className="flex text-yellow-400">{[...Array(Math.round(s.avgRating / 2))].map((_, i) => <Star key={i} size={10} fill="currentColor" />)}</div>
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
