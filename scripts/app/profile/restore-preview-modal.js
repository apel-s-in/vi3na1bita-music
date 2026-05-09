import { BackupVault } from '../../analytics/backup-vault.js';
import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';
import { compareBackupBranches } from '../../analytics/backup-branch-compare.js';
import { renderCloudStatPair, esc, fmtDateTime, renderActionGrid, renderModalNote, renderStatusPill, renderDeviceTitle } from './profile-render-kit.js';
import { renderRestoreDiffHtml } from './restore-diff.js';

export const openRestorePreviewModal = (d, oC) => {
  const s = BackupVault.summarizeBackupObject(d), lI = getLocalBackupUiSnapshot({ name: 'Слушатель' }), c = compareLocalVsCloud(lI, s || {}), cL = getBackupCompareLabel(lI, s || {}), tH = renderCloudStatPair({ localSummary: lI, cloudSummary: s });
  const m = window.Modals?.open?.({ title: 'Предпросмотр восстановления', maxWidth: 420, bodyHtml: `${renderStatusPill({ text: c.state || 'compare', tone: c.state === 'conflict' ? 'warn' : 'info' })}<div class="modal-confirm-text" style="font-size:13px;margin-top:10px"><b>Дата backup:</b> ${fmtDateTime(s.timestamp)}<br><b>Версия приложения:</b> ${esc(s.appVersion)}<br><b>Событий:</b> ${esc(s.eventCount || 0)}<br>${tH}<span style="color:#9db7dd">Сравнение: ${esc(cL)}. Restore объединяет данные через event log и безопасный merge.</span></div><div id="manual-restore-diff">${renderRestoreDiffHtml({ backup: d, localSummary: lI, cloudSummary: s })}</div>${renderModalNote('<b>Выберите режим восстановления:</b>', { style: 'font-size:13px' })}${renderActionGrid([{text:'Восстановить всё',primary:true,attrs:'data-restore-mode="all"'},{text:'Профиль, избранное, плейлисты',attrs:'data-restore-mode="profile"'},{text:'Статистику и достижения',attrs:'data-restore-mode="stats"'}])}` });
  if (!m) return;
  compareBackupBranches({ backup: d }).then(br => { const box = m.querySelector('#manual-restore-diff'); if (box) box.innerHTML = renderRestoreDiffHtml({ backup: d, localSummary: lI, cloudSummary: s, branch: br }); }).catch(() => {});
  m.addEventListener('click', e => { const b = e.target.closest('[data-restore-mode]'); if (b) { m.remove(); oC?.(b.dataset.restoreMode || 'all'); } });
};

export const openRestoreVersionPickerModal = (i, oP) => {
  const l = (Array.isArray(i) ? i : []).slice(0, 5), bH = l.length ? `<div class="restore-version-picker"><div class="fresh-hero" style="margin-bottom:10px"><div class="fresh-hero-icon">☁️</div><div><div class="fresh-hero-title">Версии backup</div><div class="fresh-hero-sub">Выберите копию для предпросмотра восстановления.</div></div></div><div class="fresh-scroll fresh-version-list">${l.map((it,idx)=>{const dev=renderDeviceTitle({sourceDeviceLabel:it?.sourceDeviceLabel,sourceDeviceClass:it?.sourceDeviceClass,sourcePlatform:it?.sourcePlatform});return `<button type="button" class="fresh-version-card ${idx===0?'is-picked':''}" data-restore-path="${esc(it.path||'')}"><span class="fresh-version-mark">${it.isLatest?'☁️':'🕘'}</span><span class="fresh-version-main"><b>${it.isLatest?'Последняя копия':'Архивная версия'} ${it.checksum?'✓':''}</b><small>${fmtDateTime(it.timestamp)} · ${esc(it.sizeHuman||'unknown')}${it.appVersion?` · v${esc(String(it.appVersion))}`:''} · ${dev}</small></span></button>`}).join('')}</div></div>` : `<div class="modal-confirm-text" style="text-align:center;color:#9db7dd"><div style="font-size:32px;margin-bottom:12px">☁️</div><div>Список версий backup не получен.</div><div style="margin-top:8px;font-size:12px;opacity:.7">Проверьте подключение и попробуйте сохранить backup заново.</div></div>`;
  const m = window.Modals?.open?.({ title: '', maxWidth: 390, bodyHtml: bH });
  m?.addEventListener('click', e => { const b = e.target.closest('[data-restore-path]'); if (b) { m.remove(); oP?.(String(b.dataset.restorePath || '').trim() || null); } });
};

export default { openRestorePreviewModal, openRestoreVersionPickerModal };
