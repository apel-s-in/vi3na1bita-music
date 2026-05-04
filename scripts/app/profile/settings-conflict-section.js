import { markDeviceSettingsDirty } from '../../analytics/sync-dirty-events.js';

export const renderConflictSettingsSection = () => {
  const v = localStorage.getItem('backup:conflict_policy:v1') || 'ask';
  return `<button type="button" class="set-acc-btn">ПОЛИТИКА КОНФЛИКТОВ</button><div class="set-acc-body"><div class="set-row"><div class="set-info"><div class="set-title">Как решать конфликт restore</div><div class="set-sub">Применяется к merge избранного, плейлистов и device settings</div></div><select id="backup-conflict-policy" style="max-width:190px"><option value="ask" ${v==='ask'?'selected':''}>Спрашивать</option><option value="latest" ${v==='latest'?'selected':''}>Latest-write-wins</option><option value="trash" ${v==='trash'?'selected':''}>Удалённое в корзину</option></select></div></div>`;
};

export const bindConflictSettingsSection = root => {
  const sel = root?.querySelector('#backup-conflict-policy');
  if (!sel || sel._bound) return;
  sel._bound = true;
  sel.addEventListener('change', e => {
    localStorage.setItem('backup:conflict_policy:v1', e.target.value || 'ask');
    markDeviceSettingsDirty();
    window.NotificationSystem?.success?.('Политика конфликтов сохранена');
  });
};

export default { renderConflictSettingsSection, bindConflictSettingsSection };
