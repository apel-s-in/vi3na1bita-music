import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';
import { esc, fmtDateTime, renderSectionCard } from './profile-ui-kit.js';

export const openBackupInfoModal = () => window.Modals?.open?.({
  title: 'Что сохраняется в backup',
  maxWidth: 400,
  bodyHtml: `<div class="modal-confirm-text">Backup хранит общий прогресс аккаунта и данные синхронизации.</div>${renderSectionCard({ title: 'Shared backup', body: `<ul style="margin:0 0 0 18px;color:#eaf2ff;line-height:1.5"><li>статистика и event log</li><li>достижения, XP, стрики</li><li>профиль</li><li>избранное и плейлисты</li><li>реестр устройств</li><li>внутренние intel/store данные</li></ul>` })}${renderSectionCard({ title: 'Device settings', style: 'margin-top:10px', body: `<div style="color:#9db7dd;font-size:12px;line-height:1.45">Локальные настройки устройства сохраняются отдельно в <b>device-settings/&lt;deviceStableId&gt;.json</b>: громкость, качество, offline/UI/player prefs. Восстановление всегда выполняется вручную через предпросмотр и выбор устройства.</div>` })}`
});

export const openBackupFoundModal = m => {
  const lI = getLocalBackupUiSnapshot({ name: 'Слушатель' });
  const c = compareLocalVsCloud(lI, m || {});
  const cL = getBackupCompareLabel(lI, m || {});
  const dev = [m?.sourceDeviceLabel, m?.sourceDeviceClass, m?.sourcePlatform].filter(Boolean).join(' · ');
  window.Modals?.open?.({
    title: 'Облачная копия найдена',
    maxWidth: 400,
    bodyHtml: `${renderSectionCard({ title: 'Облачная копия', body: `<div class="modal-confirm-text" style="margin:0"><b>Статус:</b> копия доступна<br><b>Дата:</b> ${fmtDateTime(m?.timestamp)}<br><b>Профиль:</b> ${esc(m?.profileName || 'Слушатель')}<br><b>Устройство:</b> ${esc(dev || 'не указано')}<br><b>Версия приложения:</b> ${esc(m?.appVersion || 'unknown')}<br><b>Размер:</b> ${esc(m?.sizeHuman || 'unknown')}<br><b>Сравнение:</b> ${esc(cL)}<br><b>Тип:</b> ${esc(c.state)}<br>${m?.historyPath ? `<b>История:</b> версионированный backup сохранён<br>` : ''}</div>` })}<div style="color:#9db7dd;font-size:12px;line-height:1.45;margin-top:10px">Копия хранится в личной папке приложения на Яндекс Диске и привязана к аккаунту владельца.</div>`
  });
};

export default { openBackupInfoModal, openBackupFoundModal };
