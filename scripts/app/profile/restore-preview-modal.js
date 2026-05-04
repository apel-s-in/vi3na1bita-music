import { BackupVault } from '../../analytics/backup-vault.js';
import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';
import { renderCloudStatPair } from './cloud-ui-helpers.js';
import { esc, fmtDateTime, renderInlineActions } from './profile-ui-kit.js';

export const openRestorePreviewModal = (d, oC) => {
  const s = BackupVault.summarizeBackupObject(d), lI = getLocalBackupUiSnapshot({ name: 'Слушатель' }), c = compareLocalVsCloud(lI, s || {}), cL = getBackupCompareLabel(lI, s || {});
  const tH = renderCloudStatPair({ localSummary: lI, cloudSummary: s });
  const m = window.Modals?.open?.({
    title: 'Предпросмотр восстановления',
    maxWidth: 400,
    bodyHtml: `<div class="modal-confirm-text" style="font-size:13px"><b>Дата backup:</b> ${fmtDateTime(s.timestamp)}<br><b>Версия приложения:</b> ${esc(s.appVersion)}<br>${tH}<span style="color:#9db7dd">Сравнение: ${esc(cL)} (${esc(c.state)}). При восстановлении применяется безопасное слияние: высокие результаты (XP, уровни, достижения) не будут понижены, а добавятся к текущим.</span><br><br><b>Выберите режим:</b></div>${renderInlineActions([{ text: 'Восстановить всё', primary: true, attrs: 'data-restore-mode="all"' }, { text: 'Профиль, избранное, плейлисты', attrs: 'data-restore-mode="profile"' }, { text: 'Статистику и достижения', attrs: 'data-restore-mode="stats"' }])}`
  });
  m?.addEventListener('click', e => {
    const b = e.target.closest('[data-restore-mode]');
    if (b) {
      m.remove();
      oC?.(b.dataset.restoreMode || 'all');
    }
  });
};

export const openRestoreVersionPickerModal = (i, oP) => {
  const l = (Array.isArray(i) ? i : []).slice(0, 5);
  const bH = l.length ? `<div class="restore-version-picker">
    <div class="fresh-hero" style="margin-bottom:10px">
      <div class="fresh-hero-icon">☁️</div>
      <div><div class="fresh-hero-title">Версии backup</div><div class="fresh-hero-sub">Выберите копию для предпросмотра восстановления.</div></div>
    </div>
    <div class="fresh-scroll fresh-version-list">${l.map((it, idx) => {
      const dev = [it?.sourceDeviceLabel, it?.sourceDeviceClass].filter(Boolean).join(' · ');
      return `<button type="button" class="fresh-version-card ${idx === 0 ? 'is-picked' : ''}" data-restore-path="${esc(it.path || '')}">
        <span class="fresh-version-mark">${it.isLatest ? '☁️' : '🕘'}</span>
        <span class="fresh-version-main">
          <b>${it.isLatest ? 'Последняя копия' : 'Архивная версия'}</b>
          <small>${fmtDateTime(it.timestamp)} · ${esc(it.sizeHuman || 'unknown')}${it.appVersion ? ` · v${esc(String(it.appVersion))}` : ''}${dev ? ` · ${esc(dev)}` : ''}${it.checksum ? ' · ✓' : ''}</small>
        </span>
      </button>`;
    }).join('')}</div>
  </div>` : `<div class="modal-confirm-text" style="text-align:center;color:#9db7dd"><div style="font-size:32px;margin-bottom:12px">☁️</div><div>Список версий backup не получен.</div><div style="margin-top:8px;font-size:12px;opacity:.7">Проверьте подключение и попробуйте сохранить backup заново.</div></div>`;
  const m = window.Modals?.open?.({ title: '', maxWidth: 390, bodyHtml: bH });
  m?.addEventListener('click', e => {
    const b = e.target.closest('[data-restore-path]');
    if (b) {
      m.remove();
      oP?.(String(b.dataset.restorePath || '').trim() || null);
    }
  });
};

export default { openRestorePreviewModal, openRestoreVersionPickerModal };
