// UID.104_(Trust and eligibility state)_(отдельная пользовательская проверка доверия)_(без блокировки локального прогресса)
// UID.112_(Profile command center)_(Профиль показывает trust summary рядом с backup/ledger)_(командный центр синхронизации и будущих призов)

import { refreshTrustState } from '../../analytics/trust-state.js';
import { metaDB } from '../../analytics/meta-db.js';
import { esc, fmtDateTime, renderCloudSectionCard, renderInlineActions, renderKeyValueRow, renderScoreBar } from './profile-render-kit.js';

const color = s => s === 'high' ? '#ff6b6b' : (s === 'medium' ? '#ffb74d' : '#9db7dd');
const flag = f => `<div style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="font-size:12px;font-weight:900;color:${color(f.severity)}">${esc(f.title || f.code)} · ${esc(f.severity)} · ${Number(f.count || 0)}</div><div style="font-size:11px;color:#9db7dd;line-height:1.35;margin-top:3px">${esc(f.desc || '')}</div></div>`;

const render = st => `${renderCloudSectionCard({ title:'Trust summary', body: `
  ${renderKeyValueRow({ label:'Статус', value:st.label || st.status || '—' })}
  ${renderKeyValueRow({ label:'Score', value:`${st.score || 0}/100` })}
  ${renderKeyValueRow({ label:'Событий проверено', value:st.eventsChecked || 0 })}
  ${renderKeyValueRow({ label:'High / Medium / Low', value:`${st.highCount || 0} / ${st.mediumCount || 0} / ${st.lowCount || 0}` })}
  ${renderKeyValueRow({ label:'Обновлено', value:st.updatedAt ? fmtDateTime(st.updatedAt) : '—' })}
  ${renderScoreBar({ score:st.score || 0, status:st.status || 'ok' })}
` })}${renderCloudSectionCard({ title:'Флаги', style:'margin-top:10px', body: st.flags?.length ? st.flags.map(flag).join('') : '<div style="font-size:12px;color:#81c784">Подозрительных признаков не найдено</div>' })}${renderInlineActions([{ text:'Обновить проверку', primary:true, attrs:'data-trust-refresh="1"' }])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Проверка доверия ничего не блокирует. Локальные достижения и статистика остаются у пользователя. Для будущих призов потребуется отдельная server-side validation.</div>`;

export const openTrustCheckModal = async () => {
  const load = () => refreshTrustState({ db: metaDB, reason:'trust_modal' }).catch(e => ({ status:'error', label:'Ошибка проверки', score:0, eventsChecked:0, flags:[{ code:'trust_error', severity:'high', count:1, title:'Ошибка trust-state', desc:String(e?.message || '') }] }));
  const m = window.Modals?.open?.({ title:'Проверка доверия', maxWidth:430, bodyHtml:render(await load()) });
  m?.addEventListener('click', async e => {
    if (!e.target.closest('[data-trust-refresh]')) return;
    const st = await load();
    if (m.isConnected) m.querySelector('.modal-body').innerHTML = render(st);
    window.NotificationSystem?.success?.('Проверка доверия обновлена ✅');
  });
};

export default { openTrustCheckModal };
