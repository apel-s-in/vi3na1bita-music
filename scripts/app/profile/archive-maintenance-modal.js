// UID.100_(Backup snapshot as life capsule)_(Archive maintenance UI)_(preview -> compact index -> no autodelete)
// UID.112_(Profile command center)_(Профиль управляет archive health)_(branches/segments/noise/duplicates)
// UID.094_(No-paralysis rule)_(archive maintenance не влияет на playback)_(только чтение/запись index)

import { inspectArchive, createCompactArchiveIndex } from '../../analytics/backup-debug.js';
import { esc, renderCloudSectionCard, renderInlineActions, renderKeyValueRow, renderWarnList } from './profile-render-kit.js';

let lastPlan = null;
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const rowBranch = b => `<div class="profile-list-item"><div style="font-size:20px">🌿</div><div class="log-info"><div class="log-title">${esc(b.branchId || 'legacy')}</div><div class="log-desc">chain: ${esc(b.chainId || '—')} · seg: ${n(b.segments)} · seq: ${n(b.fromSeq)}–${n(b.toSeq)}</div><div class="log-desc">events: ${n(b.events)} · size: ${esc(b.sizeHuman || '—')} · legacy: ${n(b.legacySegments)}</div></div></div>`;

const render = p => {
  const branches = p?.branches || [], cand = p?.candidateRemovePaths || [];
  return `${renderCloudSectionCard({ title:'Archive summary', body: `
    ${renderKeyValueRow({ label:'Branches', value:p?.totals?.branches || p?.summary?.branchesCount || branches.length, wordBreak:false })}
    ${renderKeyValueRow({ label:'Segments', value:p?.totals?.segments || p?.beforeItems || 0, wordBreak:false })}
    ${renderKeyValueRow({ label:'Events in index', value:p?.totals?.events || p?.summary?.eventCount || 0, wordBreak:false })}
    ${renderKeyValueRow({ label:'Downloaded / restored', value:`${p?.downloadedSegments || 0} seg · ${p?.restoredEventCount || 0} events`, wordBreak:false })}
    ${renderKeyValueRow({ label:'Noise / legacy / duplicates', value:`${p?.noiseEvents || 0} / ${p?.legacyEvents || 0} / ${p?.duplicateEvents || 0}`, wordBreak:false })}
    ${renderKeyValueRow({ label:'Compact index', value:`${p?.beforeItems || 0} → ${p?.afterItems || 0}`, valueColor:(p?.afterItems || 0) < (p?.beforeItems || 0) ? '#81c784' : '#9db7dd', wordBreak:false })}
  ` })}${renderCloudSectionCard({ title:'Branches', style:'margin-top:10px', body: branches.length ? branches.map(rowBranch).join('') : '<div class="fav-empty">Branches не найдены</div>' })}${renderCloudSectionCard({ title:'Кандидаты на исключение из index', style:'margin-top:10px', body: cand.length ? renderWarnList({ items:cand.map(x => `${x.reason}: ${x.path} · useful ${x.usefulEvents}/${x.events} · ${x.sizeHuman || ''}`), empty:'Кандидатов нет' }) : '<div style="font-size:12px;color:#81c784">Явных duplicate/noise сегментов не найдено</div>' })}${renderInlineActions([{ text:'Обновить preview', attrs:'data-arch-act="refresh"' }, { text:'Создать compact index', primary:true, attrs:'data-arch-act="compact"' }, { text:'Скопировать candidates', attrs:'data-arch-act="copy"' }])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Compact index не удаляет файлы. Он только убирает duplicate/noise paths из events/index.json. Физическое удаление сегментов пока не выполняется автоматически.</div>`;
};

export const openArchiveMaintenanceModal = async () => {
  const load = async () => {
    const t = window.YandexAuth?.getToken?.();
    if (!t) throw new Error('no_token');
    lastPlan = await inspectArchive(t, { limitSegments: 120 });
    return lastPlan;
  };
  const m = window.Modals?.open?.({ title:'Обслуживание archive', maxWidth:440, bodyHtml:'<div class="fav-empty">Сканируем archive...</div>' });
  try { if (m?.isConnected) m.querySelector('.modal-body').innerHTML = render(await load()); } catch (e) { if (m?.isConnected) m.querySelector('.modal-body').innerHTML = `<div class="fav-empty">Ошибка archive inspect: ${esc(e?.message || '')}</div>`; }
  m?.addEventListener('click', async e => {
    const act = e.target.closest('[data-arch-act]')?.dataset.archAct; if (!act) return;
    try {
      if (act === 'refresh') { m.querySelector('.modal-body').innerHTML = render(await load()); window.NotificationSystem?.success?.('Archive preview обновлён ✅'); }
      if (act === 'copy') { await navigator.clipboard?.writeText?.((lastPlan?.candidateRemovePaths || []).map(x => x.path).join('\n')); window.NotificationSystem?.success?.('Candidates скопированы ✅'); }
      if (act === 'compact') {
        window.Modals?.confirm?.({
          title:'Создать compact index?',
          textHtml:'Будет перезаписан только <b>events/index.json</b>. Сами <b>seg_*.json</b> останутся на Диске. Это безопасно и обратимо по файлам.',
          confirmText:'Создать',
          cancelText:'Отмена',
          onConfirm:async()=>{ const t=window.YandexAuth?.getToken?.(); const r=await createCompactArchiveIndex(t,{limitSegments:120}); lastPlan=r.plan; if(m.isConnected)m.querySelector('.modal-body').innerHTML=render(lastPlan); window.NotificationSystem?.success?.('Compact index создан ✅'); }
        });
      }
    } catch (err) { window.NotificationSystem?.error?.('Archive action failed: ' + String(err?.message || '')); }
  });
};

export default { openArchiveMaintenanceModal };
