// scripts/offline/queue-manager.js

import { getSetting } from './cache-db.js';

const PRIORITY = {
  CUR: 0, // P0
  NEIGHBOR: 1, // P1
  PINNED: 2, // P2
  UPDATE: 3, // P3
  CLOUD_FILL: 4, // P4
  NON_AUDIO: 5, // P5
};

export class QueueManager {
  constructor({ downloader, onProgress, onDone, onError }) {
    // downloader: async ({uid, url, quality}) => { blob }
    this._downloader = downloader;
    this._onProgress = onProgress || (() => {});
    this._onDone = onDone || (() => {});
    this._onError = onError || (() => {});
    this._q = [];
    this._active = null;
    this._cancelled = false;
  }

  add(task) {
    // task: { id?, uid, url, quality:'hi'|'lo', type:'audio'|'asset', prio:number, meta?:any }
    const id = task.id || `${task.uid}|${task.quality}|${task.url}|${task.type}`;
    if (this._q.find(t => t._id === id) || this._active?._id === id) return id; // dedup
    const prio = typeof task.prio === 'number' ? task.prio : PRIORITY.NON_AUDIO;
    this._q.push({ ...task, _id: id, prio });
    this._q.sort((a, b) => a.prio - b.prio);
    this._pump();
    return id;
  }

  removeByUid(uid, predicate = null) {
    this._q = this._q.filter(t => t.uid !== uid || (predicate && !predicate(t)));
  }

  get active() { return this._active; }
  get size() { return this._q.length + (this._active ? 1 : 0); }
  get pendingList() { return [...this._q]; }

  async _pump() {
    if (this._active || this._q.length === 0 || this._cancelled) return;
    // respect network policy
    const allowed = await this._isNetworkAllowed();
    // для аудио: всё равно 1 загрузка параллельно; если сеть не разрешена, не стартуем
    const next = this._q.shift();
    if (next.type === 'audio' && !allowed) {
      // отложим, вернём в конец очереди
      this._q.push(next);
      return;
    }
    this._active = next;
    try {
      const blob = await this._downloader({
        uid: next.uid,
        url: next.url,
        quality: next.quality,
        onProgress: (p) => this._onProgress({ ...next, progress: p }),
      });
      this._onDone({ ...next, blob });
    } catch (e) {
      this._onError({ ...next, error: e });
    } finally {
      this._active = null;
      // троттлинг можно добавить позже
      this._pump();
    }
  }

  async _isNetworkAllowed() {
    const offlineMode = await getSetting('offlinePolicy:v1', 'off'); // 'on'|'off'
    // Offline mode — политика, не “рубильник”: разрешает/запрещает скачивания
    const allowWifi = await getSetting('net:wifi:v1', true);
    const allowMobile = await getSetting('net:mobile:v1', true);
    // определим тип сети
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let type = 'unknown';
    if (conn && typeof conn.type === 'string') {
      type = conn.type; // 'wifi'|'cellular'|...
    }
    if (offlineMode !== 'on') return false; // политику выключили — не качаем
    if (type === 'wifi') return !!allowWifi;
    if (type === 'cellular') return !!allowMobile;
    // unknown → спросит подтверждение вне очереди (UI слой), тут — уважаем предыдущий выбор сессии
    const remembered = sessionStorage.getItem('net:unknown:confirm') === 'true';
    return remembered;
  }

  cancelAll() {
    this._q = [];
    this._cancelled = true;
  }
}

export { PRIORITY };
