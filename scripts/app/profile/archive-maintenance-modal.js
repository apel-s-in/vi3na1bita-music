// UID.100_(Backup snapshot as life capsule)_(Archive maintenance UI)_(magic repair + preview/compact/rebuild/delete selected)
// UID.112_(Profile command center)_(одна кнопка чинит archive/latest)_(branches/segments/noise/duplicates)
// UID.094_(No-paralysis rule)_(archive maintenance не влияет на playback)_(только чтение/запись backup/archive)

import { inspectArchive, createCompactArchiveIndex, rebuildArchiveIndexFromFiles, deleteArchiveSegments } from '../../analytics/backup-debug.js';
import { runArchiveMagicRepair } from '../../analytics/archive-maintenance.js';
import { validateArchiveBranch } from '../../analytics/archive-branch-validation.js';
import { esc, renderInlineActions } from './profile-render-kit.js';
import { renderArchiveSummaryCard, renderArchiveBranchesList, renderArchiveCandidatesList } from './archive-render-kit.js';

let lastPlan = null;
const token = () => window.YandexAuth?.getToken?.();

const renderBranchPicker = p => (p?.branches || []).length ? `<div style="margin-top:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px"><div style="font-size:11px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Deep branch validation</div><select id="arch-branch-select" style="width:100%;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#eaf2ff;padding:10px">${(p.branches || []).map(b => `<option value="${esc(b.branchId || '')}">${esc(b.branchId || 'legacy')} · ${b.segments || 0} seg · ${b.fromSeq || 0}-${b.toSeq || 0}</option>`).join('')}</select></div>` : '';
const renderValidationResult = r => `<div class="modal-confirm-text" style="font-size:12px;line-height:1.55"><b>Status:</b> ${esc(r.status)}<br><b>Segments:</b> ${r.downloadedSegments}/${r.segments}<br><b>Events:</b> ${r.uniqueEvents}/${r.events}<br><b>Seq:</b> ${r.seqFrom}–${r.seqTo}<br><b>Segment issues:</b> ${r.segmentIssues?.length || 0}<br><b>Missing ranges:</b> ${r.missingRanges?.length || 0}<br><b>Duplicate eventId:</b> ${r.duplicateEventIds?.length || 0}<br><b>Duplicate seq:</b> ${r.duplicateSeq?.length || 0}<br><b>Broken hashes:</b> ${r.brokenHashes?.length || 0}<br><b>Broken links:</b> ${r.brokenLinks?.length || 0}<br><b>Legacy events:</b> ${r.legacyEvents?.length || 0}</div>`;
const render = p => `${renderArchiveSummaryCard(p)}${renderArchiveBranchesList(p?.branches || [])}${renderBranchPicker(p)}${renderArchiveCandidatesList(p?.candidateRemovePaths || [], { selectable:true })}${renderInlineActions([
  { text:'🪄 Починить всё', primary:true, attrs:'data-arch-act="magic"' },
  { text:'Обновить preview', attrs:'data-arch-act="refresh"' },
  { text:'Compact index', attrs:'data-arch-act="compact"' },
  { text:'Пересобрать index из файлов', attrs:'data-arch-act="rebuild"' },
  { text:'Проверить branch', attrs:'data-arch-act="validate-branch"' },
  { text:'Удалить выбранные', attrs:'data-arch-act="delete-selected"' },
  { text:'Скопировать candidates', attrs:'data-arch-act="copy"' }
])}<div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.45"><b>🪄 Починить всё</b>: объединит local + latest + archive, создаст canonical contiguous segments, удалит obsolete seg-файлы после успешной замены и сохранит лёгкий latest backup. Воспроизведение не трогается.</div>`;

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
      if (act === 'validate-branch') {
        const branchId = m.querySelector('#arch-branch-select')?.value || '';
        if (!branchId) return window.NotificationSystem?.warning?.('Branch не выбрана');
        m.querySelector('.modal-body').innerHTML = '<div class="fav-empty">Проверяем branch...</div>';
        const r = await validateArchiveBranch({ token:token(), branchId });
        window.Modals?.open?.({ title:`Branch: ${r.status}`, maxWidth:420, bodyHtml:renderValidationResult(r) });
        m.querySelector('.modal-body').innerHTML = render(await load());
        return;
      }
      if (act === 'magic') return window.Modals?.confirm?.({ title:'🪄 Починить backup/archive автоматически?', textHtml:'Будет выполнено безопасное обслуживание:<br><br>1) local + latest + archive будут объединены по <b>eventId</b>;<br>2) service/noise events не попадут в canonical archive;<br>3) будут созданы честные contiguous segments;<br>4) старые obsolete seg-файлы будут удалены только после успешной замены;<br>5) latest backup будет сохранён компактным.<br><br>Музыка и iOS background не затрагиваются.', confirmText:'Починить всё', cancelText:'Отмена', onConfirm:async()=>{ m.querySelector('.modal-body').innerHTML='<div class="fav-empty">🪄 Чиним archive... Это может занять до минуты.</div>'; const r=await runArchiveMagicRepair({ token:token(), deleteObsolete:true, saveLatest:true }); lastPlan=await load(); if(m.isConnected)m.querySelector('.modal-body').innerHTML=render(lastPlan); window.Modals?.open?.({ title:'Archive repair complete', maxWidth:390, bodyHtml:`<div class="modal-confirm-text">Готово ✅<br><br><b>Events:</b> ${r.plan.canonicalEvents}<br><b>Segments:</b> ${r.plan.beforeSegments} → ${r.plan.afterSegments}<br><b>Uploaded:</b> ${r.uploadedSegments}<br><b>Deleted obsolete:</b> ${r.deleteResult?.deleted || 0}<br><b>Latest save:</b> ${r.latestSave?.ok !== false ? 'ok' : esc(r.latestSave?.error || 'failed')}</div>` }); } });
      if (act === 'delete-selected') {
        const paths = selectedPaths(m);
        if (!paths.length) return window.NotificationSystem?.warning?.('Сначала отметьте candidate paths');
        return window.Modals?.confirm?.({ title:`Удалить выбранные сегменты (${paths.length})?`, textHtml:'Будут удалены только отмеченные <b>seg_*.json</b>. После удаления index будет пересобран из оставшихся файлов. Это действие физически меняет Яндекс Диск.', confirmText:'Удалить выбранные', cancelText:'Отмена', onConfirm:async()=>{ await deleteArchiveSegments(token(), paths); m.querySelector('.modal-body').innerHTML=render(await load()); window.NotificationSystem?.success?.('Выбранные сегменты удалены, index пересобран ✅'); } });
      }
    } catch (err) { window.NotificationSystem?.error?.('Archive action failed: ' + String(err?.message || '')); }
  });
};

export default { openArchiveMaintenanceModal };
