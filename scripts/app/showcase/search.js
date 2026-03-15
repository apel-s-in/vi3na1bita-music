export async function buildShowcaseSearchDisplay({ query, ensureLyricsIndexLoaded, searchUidsByQuery, trk, ctx }) {
  const hid = new Set(ctx?.hidden || []);
  if (!query) return { type: 'normal' };
  await ensureLyricsIndexLoaded();
  const res = (searchUidsByQuery({ query }) || []).filter(trk);
  return { type: 'search', res, cOrd: ctx?.order || [], cHid: hid };
}

export function addSearchResultsToContext({ selected, trk, ctx, saveCtx, isDefault, store, clearSearch, rerender, notify }) {
  const u = [...selected].filter(trk);
  if (!u.length) return;
  if (!ctx) return;
  const s = new Set(ctx.order || []);
  u.forEach(x => { if (!s.has(x)) { ctx.order.push(x); s.add(x); } });
  saveCtx(ctx);
  clearSearch?.();
  rerender?.();
  notify?.success?.(`Добавлено ${u.length} треков`);
}

export function handleSharedShowcasePlaylist({ raw, trk, modals, esc, createPlaylist, notify }) {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(String(raw).trim()))));
    if (!d?.n || !Array.isArray(d?.u)) throw 1;
    const u = d.u.filter(trk), miss = d.u.length - u.length;
    modals?.confirm?.({
      title: '🎵 Вам прислан плейлист',
      textHtml: `<b>${esc(d.n)}</b><br><br>Доступно треков: ${u.length} из ${d.u.length}.${miss > 0 ? '<br><span class="sc-shared-warn">Часть треков недоступна.</span>' : ''}`,
      confirmText: 'Добавить',
      cancelText: 'Отмена',
      onConfirm: () => createPlaylist(u, false, `${d.n} (Присланный)`)
    });
  } catch {
    notify?.error?.('Ошибка чтения ссылки');
  }
}

export default {
  buildShowcaseSearchDisplay,
  addSearchResultsToContext,
  handleSharedShowcasePlaylist
};
