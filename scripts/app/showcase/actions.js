export function createShowcaseActions({
  W,
  D,
  Store,
  SHOW,
  isDef,
  trk,
  bldTrk,
  albT,
  esc,
  uidEsc,
  PALETTE,
  openShowcaseSheet,
  renderShowcasePlaylists,
  renameShowcasePlaylist,
  shareShowcasePlaylist,
  createShowcasePlaylist
}) {
  const randShuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  return {
    playCtx({ ctxId, getActiveListTracks, hi, markLast }, uid = null, shuf = false, listOverride = null, keyOverride = null) {
      const id = ctxId(), key = keyOverride || (isDef(id) ? SHOW : `${SHOW}:${id}`);
      const list0 = listOverride || getActiveListTracks();
      if (!list0.length) return;

      const list = shuf ? randShuffle([...list0]) : list0;
      const idx = uid && !shuf ? Math.max(0, list.findIndex(t => t.uid === uid)) : 0;

      W.AlbumsManager?.setPlayingAlbum?.(key);
      if (!W.playerCore?.playExactFromPlaylist?.(list, list[idx]?.uid, { dir: 1 })) return;
      W.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
      hi?.(list[idx]?.uid);
      if (list[idx]?.uid) markLast?.(list[idx].uid, id);
    },

    openMenu(api, uid, fromSearch = false) {
      api.cleanupUi?.();
      const t = trk(uid), id = api.ctxId(), inPl = !isDef(id) && (Store.get(id)?.order || []).includes(uid);
      if (!t) return;

      const sh = openShowcaseSheet({
        title: esc(t.title),
        subtitle: esc(albT(t.sourceAlbum)),
        fromSearch,
        inPlaylist: inPl,
        hiddenLabel: api.isHidden(uid, id) ? `👁 Сделать активным в «${api.ctxName(id)}»` : `🙈 Скрыть в «${api.ctxName(id)}»`,
        favoriteLabel: W.playerCore?.isFavorite?.(uid) ? '❌ Убрать из Избранного' : '⭐ В Избранное',
        onAction: (a) => {
          api.setMenu(null);

          if (a === 'bm-play') {
            if (!fromSearch) return api.playCtx(uid);
            const one = bldTrk(uid);
            if (!one) return;
            return api.playCtx(uid, false, [one], `${SHOW}:search:${api.ctxId()}`);
          }

          if (a === 'bm-pl') {
            return setTimeout(() => {
              const pls = Store.pl();
              if (!pls.length) return W.NotificationSystem?.warning('Сначала создайте плейлист');
              const m = W.Modals?.open({ title: 'Добавить в плейлист', bodyHtml: `<div class="sc-playlist-pick">${pls.map(p => `<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>` });
              if (!m) return;
              m.onclick = ev => {
                const b = ev.target.closest('[data-pid]');
                if (!b) return;
                const p = Store.get(b.dataset.pid);
                if (!p) return;
                const s = new Set(p.order || []);
                if (!s.has(uid)) {
                  p.order.push(uid);
                  Store.save(p);
                  W.NotificationSystem?.success('Добавлено');
                }
                m.remove();
              };
            }, 120);
          }

          if (a === 'bm-rm') {
            const p = Store.get(id);
            if (!p) return;
            p.order = p.order.filter(x => x !== uid);
            p.hidden = (p.hidden || []).filter(x => x !== uid);
            Store.save(p);
            return api.renderTab();
          }

          if (a === 'bm-eye') return api.toggleHiddenPersist(uid, id);
          if (a === 'bm-fv') return W.playerCore?.toggleFavorite?.(uid, { albumKey: t.sourceAlbum });
          if (a === 'bm-of') return W.OfflineManager?.togglePinned?.(uid);

          if (a === 'bm-dl') {
            const link = D.createElement('a');
            W.Utils?.download?.applyDownloadLink?.(link, bldTrk(uid));
            if (link.href) link.click();
            return;
          }

          if (a === 'bm-st') return setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(uid), 120);
          if (a === 'bm-sh') return setTimeout(() => import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', bldTrk(uid))), 120);
          if (a === 'bm-cl') return setTimeout(() => api.openColorPicker(null, t.sourceAlbum), 120);
        }
      });

      api.setMenu(sh?.el || null);
    },

    openColorPicker(api, el, albumKey, playlistId) {
      let aKey = albumKey, cur = '';
      if (playlistId) cur = Store.get(playlistId)?.color || '';
      else {
        if (!aKey && el) aKey = trk(el)?.sourceAlbum;
        cur = Store.cols()?.[aKey] || '';
      }

      W.Utils?.profileModals?.palettePicker?.({
        title: playlistId ? 'Цвет плейлиста' : 'Цвет альбома',
        items: PALETTE,
        value: cur,
        resetText: 'Сбросить цвет',
        onPick: (v, m) => {
          if (playlistId) {
            const p = Store.get(playlistId);
            if (p) { p.color = v; Store.save(p); renderShowcasePlaylists({ actionsRoot: D.getElementById('sc-playlists-actions'), listRoot: D.getElementById('sc-playlists'), activeId: api.ctxId(), playlists: Store.pl(), isDefaultId: isDef, esc }); }
          } else if (aKey) {
            const c = Store.cols();
            c[aKey] = v;
            Store.setCols(c);
            api.renderBody();
          }
          m?.remove?.();
        }
      });
    },

    renamePlaylist(id) {
      renameShowcasePlaylist({
        id,
        store: Store,
        promptName: W.Utils?.profileModals?.promptName,
        onDone: () => renderShowcasePlaylists({ actionsRoot: D.getElementById('sc-playlists-actions'), listRoot: D.getElementById('sc-playlists'), activeId: Store.act(), playlists: Store.pl(), isDefaultId: isDef, esc })
      });
    },

    sharePlaylist(id) {
      shareShowcasePlaylist({
        id,
        store: Store,
        origin: W.location.origin,
        pathname: W.location.pathname,
        notify: W.NotificationSystem
      });
    },

    createPlaylist(args) {
      return createShowcasePlaylist(args);
    }
  };
}

export default { createShowcaseActions };
