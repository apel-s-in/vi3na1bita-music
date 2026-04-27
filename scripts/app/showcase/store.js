// Компактный Store витрины.
const NS = 'sc3:', deep = v => JSON.parse(JSON.stringify(v)), nowTs = () => Date.now();
const emitPlDirty = () => { try { window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'playlists' } })); } catch {} };

export const createShowcaseStore = ({ trk, getCat, ls = localStorage }) => {
  const jGet = (k, d = null) => { try { const v = ls.getItem(NS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const jSet = (k, v) => { try { ls.setItem(NS + k, JSON.stringify(v)); } catch {} };

  const normSnap = (c, fbOrd = getCat()) => {
    c = c && typeof c === 'object' ? deep(c) : {}; const o = [], h = [], s = new Set();
    [...(c.order || []), ...fbOrd].forEach(u => trk(u) && !s.has(u) && (s.add(u), o.push(u)));
    (c.hidden || []).forEach(u => trk(u) && s.has(u) && !h.includes(u) && h.push(u));
    return { order: o, hidden: h };
  };

  const normCtx = (c, def = false, fbOrd = getCat()) => {
    c = c && typeof c === 'object' ? deep(c) : {};
    const { order, hidden } = normSnap(c, fbOrd), x = { ...c, order, hidden, sortMode: c.sortMode || 'user', hiddenPlacement: c.hiddenPlacement || 'inline', createdAt: Number(c.createdAt || Date.now()), updatedAt: Number(c.updatedAt || c.createdAt || 0), deletedAt: Number(c.deletedAt || 0) };
    if (!def) x.creationSnapshot = c.creationSnapshot ? normSnap(c.creationSnapshot, c.creationSnapshot.order || order) : { order: [...order], hidden: [...hidden] };
    return x;
  };

  const mkPl = ({ id, name, order, hidden = [], color = '', sortMode = 'user', hiddenPlacement = 'inline', createdAt = nowTs(), updatedAt = nowTs(), deletedAt = 0 }) => {
    const s = normSnap({ order, hidden }, order || getCat());
    return normCtx({ id, name, order: s.order, hidden: s.hidden, color, sortMode, hiddenPlacement, createdAt, updatedAt, deletedAt, creationSnapshot: deep(s) }, false, s.order);
  };

  const Store = {
    allPl: () => (jGet('playlists', []) || []).filter(p => p?.id).map(p => normCtx(p, false, p.order || getCat())),
    pl: () => Store.allPl().filter(p => !p.deletedAt),
    setPl: v => jSet('playlists', (Array.isArray(v) ? v : []).map(p => normCtx(p, false, p?.order || getCat()))),
    get: id => Store.pl().find(p => p.id === id) || null,
    getDeleted: () => Store.allPl().filter(p => p.deletedAt),
    restore: id => { const a = Store.allPl(), i = a.findIndex(x => x.id === id); if (i < 0) return false; a[i] = { ...a[i], deletedAt: 0, updatedAt: nowTs() }; Store.setPl(a); emitPlDirty(); try { window.eventLogger?.log?.('PLAYLIST_CHANGED', null, { action: 'restore', playlistId: id, name: a[i]?.name || '' }); } catch {} return true; },
    purge: id => { const p = Store.allPl().find(x => x.id === id); Store.setPl(Store.allPl().filter(x => x.id !== id)); emitPlDirty(); try { window.eventLogger?.log?.('PLAYLIST_CHANGED', null, { action: 'purge', playlistId: id, name: p?.name || '' }); } catch {} return true; },
    save: p => {
      const a = Store.allPl(), i = a.findIndex(x => x.id === p.id);
      const prev = i >= 0 ? a[i] : null, ops = prev ? [...(prev.ops || [])] : [], ts = nowTs();
      if (prev) {
        (p.order || []).filter(u => !(prev.order || []).includes(u)).forEach(u => ops.push({ t: 'add', u, ts }));
        (prev.order || []).filter(u => !(p.order || []).includes(u)).forEach(u => ops.push({ t: 'del', u, ts }));
      } else (p.order || []).forEach(u => ops.push({ t: 'add', u, ts: p.createdAt || ts }));
      p.ops = ops.slice(-300); p.deletedAt = 0; p.updatedAt = ts;
      const n = normCtx(p, false, p.order || getCat()); n.ops = p.ops;
      i >= 0 ? a.splice(i, 1, n) : a.push(n);
      Store.setPl(a);
      emitPlDirty();
      try { window.eventLogger?.log?.('PLAYLIST_CHANGED', null, { action: prev?.deletedAt ? 'restore_update' : (prev ? 'update' : 'create'), playlistId: p.id, name: p.name || '', orderCount: (p.order || []).length, hiddenCount: (p.hidden || []).length }); } catch {}
    },
    del: id => { const a = Store.allPl(), i = a.findIndex(x => x.id === id); if (i < 0) return false; const ts = nowTs(), p = a[i]; a[i] = { ...p, deletedAt: ts, updatedAt: Math.max(Number(p.updatedAt || 0), ts) }; Store.setPl(a); emitPlDirty(); try { window.eventLogger?.log?.('PLAYLIST_CHANGED', null, { action: 'delete', playlistId: id, name: p?.name || '' }); } catch {} return true; },
    act: () => jGet('activeId', '__default__'), setAct: id => jSet('activeId', id),
    ui: () => jGet('ui_v2', { viewMode: 'flat', showNumbers: false, showHidden: false, hiddenPlacement: 'inline' }), setUi: v => jSet('ui_v2', v),
    cols: () => jGet('albumColors', {}), setCols: v => jSet('albumColors', v),
    def: () => { const d = normCtx({ sortMode: 'album-desc', ...(jGet('default') || {}) }, true, getCat()); jSet('default', d); return d; },
    setDef: v => jSet('default', normCtx(v, true)), jGet, jSet, normSnap, normCtx, mkPl
  };

  class Draft {
    constructor(id, isDefId) {
      this.id = id; this.isDef = isDefId(id);
      const s = this.isDef ? Store.def() : Store.get(id), b = this.isDef ? normCtx(s, true, getCat()) : normCtx(s?.creationSnapshot || s || { order: [], hidden: [] }, false, s?.creationSnapshot?.order || s?.order || getCat());
      this.base = { ord: [...(b.order || [])], hid: [...(b.hidden || [])] };
      this.ord = [...(s?.order || this.base.ord)]; this.hid = new Set(s?.hidden || this.base.hid); this.chk = new Set();
    }
    getList() { if (!this.isDef) return [...this.ord].filter(trk); const s = new Set(), o = []; [...this.ord, ...getCat()].forEach(u => trk(u) && !s.has(u) && (s.add(u), o.push(u))); return o; }
    toggleChecked(uid) { this.chk.has(uid) ? this.chk.delete(uid) : this.chk.add(uid); }
    toggleHidden(uid) { this.hid.has(uid) ? this.hid.delete(uid) : this.hid.add(uid); }
    setAllChecked(on) { this.chk = new Set(on ? this.getList() : []); }
    move(uid, d) { const a = this.ord, i = a.indexOf(uid), j = i + d; if (i >= 0 && j >= 0 && j < a.length) { [a[i], a[j]] = [a[j], a[i]]; this.ord = [...a]; } }
    setOrd(a) { this.ord = [...a].filter(Boolean); }
    reset() { const b = this.isDef ? normCtx({ order: getCat(), hidden: [], sortMode: 'user', hiddenPlacement: 'inline' }, true) : { order: [...this.base.ord], hidden: [...this.base.hid] }; this.ord = [...(b.order || b.ord)]; this.hid = new Set(b.hidden || b.hid); this.chk.clear(); }
    isDirty() { return JSON.stringify({ o: this.ord.filter(trk), h: [...this.hid].filter(trk) }) !== JSON.stringify({ o: this.base.ord, h: this.base.hid }); }
  }
  return { Store, Draft, mkPl, normCtx, normSnap, jGet, jSet };
};
export default { createShowcaseStore };
