import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';
import { esc, fmtDateTime, renderCloudSectionCard, renderModalNote, renderStatusPill } from './profile-render-kit.js';
import { renderYandexActionGrid } from './cloud-action-render-kit.js';

export const openBackupInfoModal = () => window.Modals?.open?.({
  title: 'Что сохраняется в backup',
  maxWidth: 400,
  bodyHtml: `${renderModalNote({ text: 'Синхронизация сохраняет пользовательские данные автоматически и передаёт только новые ranges подробной статистики.', style: 'margin:0 0 14px' })}${renderCloudSectionCard({ title: 'Общие данные аккаунта', body: `<ul style="margin:0 0 0 18px;color:#eaf2ff;line-height:1.5"><li>пользовательские плейлисты</li><li>подробные listening events по каждому устройству и треку</li><li>локальная rebuildable-статистика и временные срезы</li><li>данные для будущих персональных рекомендаций</li></ul><div style="margin-top:10px;color:#7f93b5;font-size:11px;line-height:1.4">Имя, аватар, оформление, Избранное, достижения, Осколки, Преданность, playback ownership и серверные устройства не входят в backup.</div>` })}${renderCloudSectionCard({ title: 'Device settings', style: 'margin-top:10px', body: renderModalNote({ html: 'Локальные настройки устройства сохраняются отдельно в <b>device-settings/&lt;deviceStableId&gt;.json</b>: громкость, качество, offline/UI/player prefs. Восстановление всегда выполняется вручную через предпросмотр и выбор устройства.', style: 'margin:0' }) })}${renderCloudSectionCard({ title:'Быстрые действия', style:'margin-top:10px', body:renderYandexActionGrid([['save-backup','☁️ Передать плейлисты и данные'],['sync-log','📜 Журнал синхронизации']]) })}`
});

export const openBackupFoundModal = m => {
  const lI = getLocalBackupUiSnapshot({ name: 'Слушатель' }), c = compareLocalVsCloud(lI, m || {}), cL = getBackupCompareLabel(lI, m || {}), dev = [m?.sourceDeviceLabel, m?.sourceDeviceClass, m?.sourcePlatform].filter(Boolean).join(' · ');
  window.Modals?.open?.({ title: 'Облачная копия найдена', maxWidth: 400, bodyHtml: `${renderCloudSectionCard({ title: 'Облачная копия', body: `<div class="modal-confirm-text" style="margin:0">${renderStatusPill({ text: 'копия доступна', tone: 'ok' })}<br><br><b>Дата:</b> ${fmtDateTime(m?.timestamp)}<br><b>Профиль:</b> ${esc(m?.profileName || 'Слушатель')}<br><b>Устройство:</b> ${esc(dev || 'не указано')}<br><b>Версия приложения:</b> ${esc(m?.appVersion || 'unknown')}<br><b>Размер:</b> ${esc(m?.sizeHuman || 'unknown')}<br><b>Событий:</b> ${esc(m?.eventCount || 0)}<br><b>Сравнение:</b> ${esc(cL)}<br><b>Тип:</b> ${esc(c.state)}<br>${m?.historyPath ? `<b>История:</b> версионированный backup сохранён<br>` : ''}</div>` })}${renderModalNote({ text: 'Копия хранится в личной папке приложения на Яндекс Диске и привязана к аккаунту владельца.' })}` });
};

export default { openBackupInfoModal, openBackupFoundModal };
