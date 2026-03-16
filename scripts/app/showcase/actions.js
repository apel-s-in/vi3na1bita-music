export const createShowcaseActions = ({ W, D, Store, SHOW, isDef, trk, bldTrk, albT, esc, uidEsc, PALETTE, renderShowcasePlaylists, renameShowcasePlaylist, shareShowcasePlaylist, createShowcasePlaylist, openShowcaseSheetModal, openShowcaseAddToPlaylistModal, openShowcasePaletteModal }) => ({
  playCtx: ({ ctxId, getActiveListTracks, hi, markLast }, uid = null, shuf = false, lOver = null, kOver = null) => {
    const id = ctxId(), key = kOver || (isDef(id) ? SHOW : `${SHOW}:${id}`), list0 = lOver || getActiveListTracks(); if (!list0.length) return;
    const list = shuf ? [...list0].sort(()=>Math.random()-.5) : list0, idx = uid && !shuf ? Math.max(0, list.findIndex(t => t.uid === uid)) : 0;
    W.AlbumsManager?.setPlayingAlbum?.(key);
    if (!W.playerCore?.playExactFromPlaylist?.(list, list[idx]?.uid, { dir: 1 })) return;
    W.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true }); hi?.(list[idx]?.uid); if (list[idx]?.uid) markLast?.(list[idx].uid, id);
  },
  openMenu: (api, uid, fromSearch = false) => {
    api.cleanupUi?.(); const t = trk(uid), id = api.ctxId(), inPl = !isDef(id) && (Store.get(id)?.order || []).includes(uid); if (!t) return;
    const sh = openShowcaseSheetModal({
      title: esc(t.title), subtitle: esc(albT(t.sourceAlbum)), fromSearch, inPlaylist: inPl,
      hiddenLabel: api.isHidden(uid, id) ? `👁 Сделать активным в «${api.ctxName(id)}»` : `🙈 Скрыть в «${api.ctxName(id)}»`,
      favoriteLabel: W.playerCore?.isFavorite?.(uid) ? '❌ Убрать из Избранного' : '⭐ В Избранное',
      onAction: a => {
        api.setMenu(null);
        if (a === 'bm-play') return fromSearch ? bldTrk(uid) && api.playCtx(uid, false, [bldTrk(uid)], `${SHOW}:search:${id}`) : api.playCtx(uid);
        if (a === 'bm-pl') return setTimeout(() => Store.pl().length ? openShowcaseAddToPlaylistModal({ playlists: Store.pl(), esc, modalApi: W.Modals, onPick: (pid, m) => { const p = Store.get(pid); if (p && !new Set(p.order||[]).has(uid)) { p.order.push(uid); Store.save(p); W.NotificationSystem?.success('Добавлено'); } m?.remove?.(); } }) : W.NotificationSystem?.warning('Сначала создайте плейлист'), 120);
        if (a === 'bm-rm') { const p = Store.get(id); if (p) { p.order = p.order.filter(x => x !== uid); p.hidden = (p.hidden || []).filter(x => x !== uid); Store.save(p); return api.renderTab(); } }
        if (a === 'bm-eye') return api.toggleHiddenPersist(uid, id);
        if (a === 'bm-fv') return W.playerCore?.toggleFavorite?.(uid, { albumKey: t.sourceAlbum });
        if (a === 'bm-of') return W.OfflineManager?.togglePinned?.(uid);
        if (a === 'bm-dl') { const l = D.createElement('a'); W.Utils?.download?.applyDownloadLink?.(l, bldTrk(uid)); l.href && l.click(); return; }
        if (a === 'bm-st') return setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(uid), 120);
        if (a === 'bm-sh') return setTimeout(() => import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', bldTrk(uid))), 120);
        if (a === 'bm-cl') return setTimeout(() => api.openColorPicker(null, t.sourceAlbum), 120);
      }
    });
    api.setMenu(sh?.el || null);
  },
  openColorPicker: (api, el, aKey, pId) => {
    let k = aKey, cur = pId ? Store.get(pId)?.color || '' : (!k && el ? k = trk(el)?.sourceAlbum : k, Store.cols()?.[k] || '');
    openShowcasePaletteModal({
      title: pId ? 'Цвет плейлиста' : 'Цвет альбома', items: PALETTE, value: cur, resetText: 'Сбросить цвет', modalHelper: W.Utils?.profileModals?.palettePicker,
      onPick: (v, m) => { if (pId) { const p = Store.get(pId); if (p) { p.color = v; Store.save(p); renderShowcasePlaylists({ actionsRoot: D.getElementById('sc-playlists-actions'), listRoot: D.getElementById('sc-playlists'), activeId: api.ctxId(), playlists: Store.pl(), isDefaultId: isDef, esc }); } } else if (k) { const c = Store.cols(); c[k] = v; Store.setCols(c); api.renderBody(); } m?.remove?.(); }
    });
  },
  renamePlaylist: id => renameShowcasePlaylist({ id, store: Store, promptName: W.Utils?.profileModals?.promptName, onDone: () => renderShowcasePlaylists({ actionsRoot: D.getElementById('sc-playlists-actions'), listRoot: D.getElementById('sc-playlists'), activeId: Store.act(), playlists: Store.pl(), isDefaultId: isDef, esc }) }),
  sharePlaylist: id => shareShowcasePlaylist({ id, store: Store, origin: W.location.origin, pathname: W.location.pathname, notify: W.NotificationSystem }),
  createPlaylist: args => createShowcasePlaylist(args)
});
export default { createShowcaseActions };
