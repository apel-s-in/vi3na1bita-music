// UID.100_(Backup snapshot as life capsule)_(Archive maintenance UI)_(preview -> compact/rebuild/delete selected)
// UID.112_(Profile command center)_(Профиль управляет archive health)_(branches/segments/noise/duplicates)
// UID.094_(No-paralysis rule)_(archive maintenance не влияет на playback)_(только чтение/запись index/delete selected)

import { inspectArchive, createCompactArchiveIndex, rebuildArchiveIndexFromFiles, deleteArchiveSegments } from '../../analytics/backup-debug.js';
import { esc, renderInlineActions } from './profile-render-kit.js';
import { renderArchiveSummaryCard, renderArchiveBranchesList, renderArchiveCandidatesList } from './archive-render-kit.js';

let lastPlan = null;
const token = () => window.YandexAuth?.getToken?.();

const render = p => `${renderArchiveSummaryCard(p)}${renderArchiveBranchesList(p?.branches || [])}${renderArchiveCandidatesList(p?.candidateRemovePaths || [], { selectable:true })}${renderInlineActions([
  { text:'Обновить preview', attrs:'data-arch-act="refresh"' },
  { text:'Compact index', primary:true, attrs:'data-arch-act="compact"' },
  { text:'Пересобрать index из файлов', attrs:'data-arch-act="rebuild"' },
  { text:'Удалить выбранные', attrs:'data-arch-act="delete-selected"' },
  { text:'Скопировать candidates', attrs:'data-arch-act="copy"' }
])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45">Compact/Rebuild меняют только <b>events/index.json</b>. Удаление файлов выполняется только для отмеченных checkbox сегментов и только после подтверждения.</div>`;

const selectedPaths = m => [...(m?.querySelectorAll?.('[data-arch-candidate]:checked') || [])].map(x => String(x.value || '').trim()).filter(Boolean);

export const openArchiveMaintenanceModal = async () => {
  const load = async () => {
    const t = token(); if (!t) throw new Error('no_token');
    lastPlan = await inspectArchive(t, { limitSegments:120 });
    return lastPlan;
  };
  const m = window.Modals?.open?.({ title:'Обслуживание archive', maxWidth:460, bodyHtml:'<div class="fav-empty">Сканируем archive...</div>' });
  try { if (m?.isConnected) m.querySelector('.modal-body').innerHTML = render(await load()); } catch (e) { if (m?.isConnected) m.querySelector('.modal-body').innerHTML = `<div class="fav-empty">Ошибка archive inspect: ${esc(e?.message || '')}</div>`; }
  m?.addEventListener('click', async e => {
    const act = e.target.closest('[data-arch-act]')?.dataset.archAct; if (!act) return;
    try {
      if (act === 'refresh') { m.querySelector('.modal-body').innerHTML = render(await load()); return window.NotificationSystem?.success?.('Archive preview обновлён ✅'); }
      if (act === 'copy') { await navigator.clipboard?.writeText?.((lastPlan?.candidateRemovePaths || []).map(x => x.path).join('\n')); return window.NotificationSystem?.success?.('Candidates скопированы ✅'); }
      if (act === 'compact') return window.Modals?.confirm?.({ title:'Создать compact index?', textHtml:'Будет перезаписан только <b>events/index.json</b>. Сами seg-файлы останутся.', confirmText:'Создать', cancelText:'Отмена', onConfirm:async()=>{ const r=await createCompactArchiveIndex(token(),{limitSegments:120}); lastPlan=r.plan; if(m.isConnected)m.querySelector('.modal-body').innerHTML=render(lastPlan); window.NotificationSystem?.success?.('Compact index создан ✅'); } });
      if (act === 'rebuild') return window.Modals?.confirm?.({ title:'Пересобрать index из файлов?', textHtml:'Cloud Function прочитает meta файлов в <b>events/</b> и соберёт новый <b>events/index.json</b>. Bodies сегментов не скачиваются.', confirmText:'Пересобрать', cancelText:'Отмена', onConfirm:async()=>{ await rebuildArchiveIndexFromFiles(token()); m.querySelector('.modal-body').innerHTML=render(await load()); window.NotificationSystem?.success?.('Archive index пересобран ✅'); } });
      if (act === 'delete-selected') {
        const paths = selectedPaths(m);
        if (!paths.length) return window.NotificationSystem?.warning?.('Сначала отметьте candidate paths');
        return window.Modals?.confirm?.({ title:`Удалить выбранные сегменты (${paths.length})?`, textHtml:'Будут удалены только отмеченные <b>seg_*.json</b>. После удаления index будет пересобран из оставшихся файлов. Это действие физически меняет Яндекс Диск.', confirmText:'Удалить выбранные', cancelText:'Отмена', onConfirm:async()=>{ await deleteArchiveSegments(token(), paths); m.querySelector('.modal-body').innerHTML=render(await load()); window.NotificationSystem?.success?.('Выбранные сегменты удалены, index пересобран ✅'); } });
      }
    } catch (err) { window.NotificationSystem?.error?.('Archive action failed: ' + String(err?.message || '')); }
  });
};

export default { openArchiveMaintenanceModal };
