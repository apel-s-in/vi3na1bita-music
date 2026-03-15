const NS = 'sc3:';
const deep = v => JSON.parse(JSON.stringify(v));

export const createShowcaseStore = ({ trk, getCat, ls = localStorage }) => {
  const jGet = (k, d = null) => { try { const v = ls.getItem(NS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const jSet = (k, v) => { try { ls.setItem(NS + k, JSON.stringify(v)); } catch {} };

  const normSnap = (c, fbOrd = getCat()) => {
    c = (c && typeof c === 'object') ? deep(c) : {};
    const order = [], hidden = [], seen = new Set();
    (c.order || []).forEach(u => trk(u) && !seen.has(u) && (seen.add(u), order.push(u)));
    fbOrd.forEach(u => trk(u) && !seen.has(u) && (seen.add(u), order.push(u)));
    (c.hidden || []).forEach(u => trk(u) && seen.has(u) && !hidden.includes(u) && hidden.push(u));
    return { order, hidden };
  };

  const normCtx = (c, def = false, fbOrd = getCat()) => {
    c = (c && typeof c === 'object') ? deep(c) : {};
    const { order, hidden } = normSnap(c, fbOrd);
    const x = { ...c, order, hidden, sortMode: c.sortMode || 'user', hiddenPlacement: c.hiddenPlacement || 'inline' };
    if (!def) x.creationSnapshot = c.creationSnapshot ? normSnap(c.creationSnapshot, c.creationSnapshot.order || order) : { order: [...order], hidden: [...hidden] };
    return x;
  };

  const mkPl = ({ id, name, order, hidden = [], color = '', sortMode = 'user', hiddenPlacement = 'inline', createdAt = Date.now() }) => {
    const s = normSnap({ order, hidden }, order || getCat());
    return normCtx({ id, name, order: s.order, hidden: s.hidden, color, sortMode, hiddenPlacement, createdAt, creationSnapshot: deep(s) }, false, s.order);
  };

  const Store = {
    pl: () => (jGet('playlists', []) || []).filter(p => p?.id).map(p => normCtx(p, false, p.order || getCat())),
    setPl: v => jSet('playlists', (Array.isArray(v) ? v : []).map(p => normCtx(p, false, p?.order || getCat()))),
    get: id => Store.pl().find(p => p.id === id) || null,
    save: p => {
      const arr = Store.pl(), i = arr.findIndex(x => x.id === p.id), next = normCtx(p, false, p.order || getCat());
      i >= 0 ? arr.splice(i, 1, next) : arr.push(next);
      Store.setPl(arr);
    },
    del: id => Store.setPl(Store.pl().filter(p => p.id !== id)),
    act: () => jGet('activeId', '__default__'),
    setAct: id => jSet('activeId', id),
    ui: () => jGet('ui', { viewMode: 'flat', showNumbers: true, showHidden: false, hiddenPlacement: 'inline' }),
    setUi: v => jSet('ui', v),
    cols: () => jGet('albumColors', {}),
    setCols: v => jSet('albumColors', v),
    def: () => {
      const d = normCtx({ sortMode: 'album-desc', ...(jGet('default') || {}) }, true, getCat());
      jSet('default', d);
      return d;
    },
    setDef: v => jSet('default', normCtx(v, true)),
    jGet,
    jSet,
    normSnap,
    normCtx,
    mkPl
  };

  class Draft {
    constructor(id, isDefId) {
      this.id = id;
      this.isDef = isDefId(id);
      const src = this.isDef ? Store.def() : Store.get(id);
      const base = this.isDef ? normCtx(src, true, getCat()) : normCtx(src?.creationSnapshot || src || { order: [], hidden: [] }, false, src?.creationSnapshot?.order || src?.order || getCat());
      this.base = { ord: [...(base.order || [])], hid: [...(base.hidden || [])] };
      this.ord = [...(src?.order || this.base.ord)];
      this.hid = new Set(src?.hidden || this.base.hid);
      this.chk = new Set();
    }
    getList() {
      if (!this.isDef) return [...this.ord].filter(trk);
      const seen = new Set(), out = [];
      this.ord.forEach(u => trk(u) && !seen.has(u) && (seen.add(u), out.push(u)));
      getCat().forEach(u => trk(u) && !seen.has(u) && (seen.add(u), out.push(u)));
      return out;
    }
    toggleChecked(uid) { this.chk.has(uid) ? this.chk.delete(uid) : this.chk.add(uid); }
    toggleHidden(uid) { this.hid.has(uid) ? this.hid.delete(uid) : this.hid.add(uid); }
    setAllChecked(on) { this.chk = new Set(on ? this.getList() : []); }
    move(uid, dir) {
      const a = this.ord, i = a.indexOf(uid), j = i + dir;
      if (i < 0 || j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
      this.ord = [...a];
    }
    setOrd(a) { this.ord = [...a].filter(Boolean); }
    reset() {
      const b = this.isDef ? normCtx({ order: getCat(), hidden: [], sortMode: 'user', hiddenPlacement: 'inline' }, true) : { order: [...this.base.ord], hidden: [...this.base.hid] };
      this.ord = [...(b.order || b.ord)];
      this.hid = new Set(b.hidden || b.hid);
      this.chk = new Set();
    }
    isDirty() {
      return JSON.stringify({ o: this.ord.filter(trk), h: [...this.hid].filter(trk) }) !== JSON.stringify({ o: this.base.ord, h: this.base.hid });
    }
  }

  return { Store, Draft, mkPl, normCtx, normSnap, jGet, jSet };
};

export default { createShowcaseStore };
