// scripts/analytics/engine.js
// UID-Система и Аналитика v4.0 (Изолированное ядро)
const W = window, D = document, IDB_NAME = 'MetaDB_v4', IDB_VER = 1;
const SECRET_SALT = 'vi3_salt_2025';

// 1. Инициализация MetaDB
const dbPromise = new Promise((res, rej) => {
  const req = indexedDB.open(IDB_NAME, IDB_VER);
  req.onupgradeneeded = e => {
    const db = e.target.result;
    ['events_hot', 'events_warm', 'stats', 'cloud_stats', 'keyval'].forEach(s => {
      if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    });
  };
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});
const dbOp = async (store, mode, fn) => {
  const db = await dbPromise;
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode), req = fn(tx.objectStore(store));
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
};

// 2. Утилиты (Криптография и Хэш)
const getDeviceHash = async () => {
  let h = localStorage.getItem('deviceHash');
  if (!h) { h = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('deviceHash', h); }
  return h;
};
const sha256 = async (str) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// 3. Достижения (100+ штук: базовые + генерация уровней)
export const ACHIEVEMENTS = [
  { id: 'first_blood', title: 'Первая кровь', desc: '1 полное прослушивание', target: 1, type: 'full_listen' },
  { id: 'night_owl', title: 'Ночная сова', desc: 'Слушать 00:00-05:00', target: 10, type: 'night_listen' },
  { id: 'streak_7', title: 'Недельный стрик', desc: 'Слушать 7 дней подряд', target: 7, type: 'streak' },
  { id: 'sleep_master', title: 'Повелитель снов', desc: 'Использовать таймер сна', target: 1, type: 'feature_sleep' },
  { id: 'karaoke_king', title: 'Король Караоке', desc: 'Петь под минус 5 раз', target: 5, type: 'feature_minus' },
  { id: 'clip_watcher', title: 'Киноман', desc: 'Посмотреть клипы 10 раз', target: 10, type: 'feature_clip' },
  ...Array.from({length: 94}).map((_, i) => ({
    id: `meloman_${i+2}`, title: `Меломан ур. ${i+2}`, desc: `Послушать ${(i+2)*10} треков`, target: (i+2)*10, type: 'full_listen'
  }))
];

// 4. Журнал событий (Logger)
let hotQueue = [];
export const EventLogger = {
  log: async (type, uid, data = {}) => {
    const isSuspect = D.hidden && (W.Howler?.volume() === 0 || W.playerCore?.isMuted());
    const ev = { id: crypto.randomUUID(), type, uid, data: { ...data, isSuspect }, ts: Date.now(), hash: await getDeviceHash() };
    hotQueue.push(ev);
  },
  flush: async () => {
    if (!hotQueue.length) return;
    const batch = [...hotQueue]; hotQueue = [];
    for (const e of batch) await dbOp('events_hot', 'readwrite', s => s.put(e));
    StatsAggregator.process(batch);
  }
};
setInterval(EventLogger.flush, 30000);
W.addEventListener('visibilitychange', () => D.hidden && EventLogger.flush());

// 5. Сессионный трекер (Tracker)
const Tracker = {
  active: null,
  start: (uid, variant = 'audio') => {
    if (Tracker.active && Tracker.active.uid === uid) return;
    Tracker.end();
    Tracker.active = { uid, variant, startPos: W.playerCore?.getPosition()||0, lastPos: W.playerCore?.getPosition()||0, accSec: 0, realStart: Date.now() };
  },
  tick: (pos, dur) => {
    if (!Tracker.active) return;
    const delta = pos - Tracker.active.lastPos;
    if (delta > 0 && delta <= 1.5) Tracker.active.accSec += 1;
    Tracker.active.lastPos = pos;
  },
  end: () => {
    if (!Tracker.active) return;
    const { uid, accSec, variant } = Tracker.active;
    const dur = W.playerCore?.getDuration()||1;
    const prog = Tracker.active.lastPos / dur;
    const valid = accSec >= 13, full = prog >= 0.9;
    if (valid || full) EventLogger.log('LISTEN_COMPLETE', uid, { variant, valid, full, accSec, prog });
    Tracker.active = null;
  }
};

// Привязка к PlayerCore без его модификации (Пассивный наблюдатель)
W.addEventListener('player:play', e => Tracker.start(e.detail.uid));
W.addEventListener('player:tick', e => Tracker.tick(e.detail.pos, e.detail.dur));
W.addEventListener('player:pause', Tracker.end);
W.addEventListener('player:stop', Tracker.end);
W.addEventListener('player:ended', () => { if(Tracker.active) { Tracker.active.lastPos = W.playerCore.getDuration(); Tracker.end(); }});

// 6. Агрегатор и Достижения
export const StatsAggregator = {
  process: async (events) => {
    const stats = (await dbOp('stats', 'readonly', s => s.get('global')))||{ totalListens: 0, streak: 0, lastDate: '', unlocked: [] };
    let changed = false;
    for (const e of events) {
      if (e.type === 'LISTEN_COMPLETE' && e.data.full && !e.data.isSuspect) {
        stats.totalListens++; changed = true;
        const dStr = new Date(e.ts).toISOString().split('T')[0];
        if (stats.lastDate !== dStr) {
          stats.streak = (new Date(e.ts) - new Date(stats.lastDate||0) < 90000000) ? stats.streak + 1 : 1;
          stats.lastDate = dStr;
        }
      }
      if (e.type === 'FEATURE_USED') { stats[`feat_${e.data.name}`] = (stats[`feat_${e.data.name}`]||0)+1; changed = true; }
    }
    if (changed) {
      await dbOp('stats', 'readwrite', s => s.put({ id: 'global', ...stats }));
      checkAchievements(stats);
      W.dispatchEvent(new CustomEvent('analytics:updated', { detail: stats }));
    }
  },
  getStats: async () => (await dbOp('stats', 'readonly', s => s.get('global'))) || { totalListens:0, streak:0, unlocked:[] }
};

const checkAchievements = async (stats) => {
  ACHIEVEMENTS.forEach(ach => {
    if (stats.unlocked?.includes(ach.id)) return;
    let ok = false;
    if (ach.type === 'full_listen' && stats.totalListens >= ach.target) ok = true;
    if (ach.type === 'streak' && stats.streak >= ach.target) ok = true;
    if (ok) {
      stats.unlocked = [...(stats.unlocked||[]), ach.id];
      EventLogger.log('ACHIEVEMENT_UNLOCK', null, { id: ach.id });
      W.NotificationSystem?.show(`🏆 Достижение: ${ach.title}`, 'success', 4000);
      W.dispatchEvent(new CustomEvent('analytics:achieved'));
    }
  });
};

// 7. Облако и Бэкапы (Vault)
export const CloudSync = {
  exportBackup: async () => {
    const stats = await StatsAggregator.getStats();
    const data = { version: '4.0', ts: Date.now(), hash: await getDeviceHash(), stats };
    const str = JSON.stringify(data);
    const sign = await sha256(str + SECRET_SALT);
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ ...data, sign }))));
    const a = D.createElement('a'); a.href = `data:text/plain;charset=utf-8,${b64}`;
    a.download = `vi3na1bita_${new Date().toISOString().split('T')[0]}.vi3bak`;
    a.click();
  },
  importBackup: async (file) => {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const raw = JSON.parse(decodeURIComponent(escape(atob(e.target.result))));
          const str = JSON.stringify({ version: raw.version, ts: raw.ts, hash: raw.hash, stats: raw.stats });
          if (await sha256(str + SECRET_SALT) !== raw.sign) throw new Error('TAMPER_DETECTED');
          await dbOp('stats', 'readwrite', s => s.put({ id: 'global', ...raw.stats }));
          W.dispatchEvent(new CustomEvent('analytics:updated', { detail: raw.stats }));
          res(true);
        } catch (err) { rej(err); }
      };
      reader.readAsText(file);
    });
  }
};
W.AnalyticsEngine = { EventLogger, StatsAggregator, CloudSync };
