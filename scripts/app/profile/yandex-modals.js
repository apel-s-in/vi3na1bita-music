import { BackupVault } from '../../analytics/backup-vault.js';
import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';

export const openBackupInfoModal = () => window.Modals?.open?.({ title: 'Что сохраняется в backup', maxWidth: 480, bodyHtml: `<div class="modal-confirm-text">Один backup-файл содержит полный слепок пользовательского прогресса.<br><br>Внутрь входят:<ul style="margin:10px 0 0 18px;color:#eaf2ff;line-height:1.5"><li>статистика и event log</li><li>достижения, XP, стрики</li><li>локальный профиль</li><li>избранное и плейлисты</li><li>настройки интерфейса и player state</li><li>внутренние intel/store данные</li><li>привязка к владельцу Яндекса и устройствам</li></ul><div style="margin-top:12px;color:#9db7dd">Файл можно сохранить на устройство вручную. Восстановление разрешено только под тем же Яндекс-аккаунтом владельца backup.</div></div>` });

export const openBackupFoundModal = m => { const lI = getLocalBackupUiSnapshot({ name: 'Слушатель' }), c = compareLocalVsCloud(lI, m || {}), cL = getBackupCompareLabel(lI, m || {}), dev = [m?.sourceDeviceLabel, m?.sourceDeviceClass, m?.sourcePlatform].filter(Boolean).join(' · '); window.Modals?.open?.({ title: 'Облачная копия найдена', maxWidth: 460, bodyHtml: `<div class="modal-confirm-text"><b>Статус:</b> копия доступна<br><b>Дата:</b> ${m?.timestamp ? new Date(m.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br><b>Профиль:</b> ${window.Utils?.escapeHtml?.(m?.profileName || 'Слушатель') || 'Слушатель'}<br><b>Устройство:</b> ${window.Utils?.escapeHtml?.(dev || 'не указано') || 'не указано'}<br><b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(m?.appVersion || 'unknown') || 'unknown'}<br><b>Размер:</b> ${window.Utils?.escapeHtml?.(m?.sizeHuman || 'unknown') || 'unknown'}<br><b>Сравнение:</b> ${cL}<br><b>Тип:</b> ${c.state}<br>${m?.historyPath ? `<b>История:</b> версионированный backup сохранён<br>` : ''}<br><span style="color:#9db7dd">Копия хранится в личной папке приложения на Яндекс Диске и привязана к аккаунту владельца.</span></div>` }); };

export const openRestorePreviewModal = (d, oC) => {
  const s = BackupVault.summarizeBackupObject(d), lI = getLocalBackupUiSnapshot({ name: 'Слушатель' }), c = compareLocalVsCloud(lI, s || {}), cL = getBackupCompareLabel(lI, s || {}), lR = window.achievementEngine?.profile || { level: 1, xp: 0 }, lA = Object.keys(window.achievementEngine?.unlocked || {}).length, lF = (() => { try { return JSON.parse(localStorage.getItem('__favorites_v2__') || '[]').filter(i => !i.inactiveAt).length; } catch { return 0; } })(), cR = d.data?.userProfileRpg || { level: 1, xp: 0 };
  const tH = `<div style="display:flex;gap:10px;margin:16px 0;text-align:center"><div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:12px 8px"><div style="font-size:11px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">💾 На устройстве</div><div style="font-size:14px;font-weight:900;color:#fff;margin-bottom:4px">Ур. ${lR.level} <span style="font-size:11px;color:#ff9800">(${lR.xp} XP)</span></div><div style="font-size:12px;color:#eaf2ff;margin-bottom:2px">🏆 Ачивок: <b>${lA}</b></div><div style="font-size:12px;color:#eaf2ff">⭐ Избранных: <b>${lF}</b></div></div><div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:12px 8px"><div style="font-size:11px;color:#8ab8fd;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">☁️ В облаке</div><div style="font-size:14px;font-weight:900;color:#fff;margin-bottom:4px">Ур. ${cR.level || 1} <span style="font-size:11px;color:#ff9800">(${cR.xp || 0} XP)</span></div><div style="font-size:12px;color:#eaf2ff;margin-bottom:2px">🏆 Ачивок: <b>${s.achievementsCount}</b></div><div style="font-size:12px;color:#eaf2ff">⭐ Избранных: <b>${s.favoritesCount}</b></div></div></div>`;
  const m = window.Modals?.open?.({ title: 'Предпросмотр восстановления', maxWidth: 500, bodyHtml: `<div class="modal-confirm-text" style="font-size:13px"><b>Дата backup:</b> ${s.timestamp ? new Date(s.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br><b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(s.appVersion) || s.appVersion}<br>${tH}<span style="color:#9db7dd">Сравнение: ${cL} (${c.state}). При восстановлении применяется безопасное слияние: высокие результаты (XP, уровни, достижения) не будут понижены, а добавятся к текущим.</span><br><br><b>Выберите режим:</b></div><div class="modal-choice-actions"><button type="button" class="modal-action-btn online" data-restore-mode="all">Восстановить всё</button><button type="button" class="modal-action-btn" data-restore-mode="profile">Профиль, избранное, плейлисты</button><button type="button" class="modal-action-btn" data-restore-mode="stats">Статистику и достижения</button></div>` });
  m?.addEventListener('click', e => { const b = e.target.closest('[data-restore-mode]'); if (b) { m.remove(); oC?.(b.dataset.restoreMode || 'all'); } });
};

export const openRestoreVersionPickerModal = (i, oP) => {
  const l = (Array.isArray(i) ? i : []).slice(0, 5), esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
  const bH = l.length ? `<div class="modal-confirm-text">Доступные версии backup в облаке:</div><div class="modal-choice-actions">${l.map((it, idx) => { const dev = [it?.sourceDeviceLabel, it?.sourceDeviceClass].filter(Boolean).join(' · '); return `<button type="button" class="modal-action-btn ${idx === 0 ? 'online' : ''}" data-restore-path="${esc(it.path || '')}">${it.isLatest ? '☁️ Latest' : '🕘 Архив'} · ${it.timestamp ? new Date(it.timestamp).toLocaleString('ru-RU') : 'без даты'} · ${esc(it.sizeHuman || 'unknown')}${it.appVersion ? ` · v${esc(String(it.appVersion))}` : ''}${dev ? ` · ${esc(dev)}` : ''}${it.checksum ? ` · ✓` : ''}</button>`; }).join('')}</div>` : `<div class="modal-confirm-text" style="text-align:center;color:#9db7dd"><div style="font-size:32px;margin-bottom:12px">☁️</div><div>Список версий backup не получен.</div><div style="margin-top:8px;font-size:12px;opacity:.7">Проверьте подключение и попробуйте сохранить backup заново.</div></div>`;
  const m = window.Modals?.open?.({ title: 'Выберите облачную версию', maxWidth: 500, bodyHtml: bH });
  m?.addEventListener('click', e => { const b = e.target.closest('[data-restore-path]'); if (b) { m.remove(); oP?.(String(b.dataset.restorePath || '').trim() || null); } });
};

export const openFreshLoginRestoreModal = ({ meta, items = [], onRestore, onNewDevice, onLater } = {}) => {
  const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
  const safe = Array.isArray(items) && items.length ? items : (meta ? [meta] : []);
  const localSnap = getLocalBackupUiSnapshot({ name: 'Слушатель' });
  const cloudSnap = meta || safe[0] || {};
  const cmp = compareLocalVsCloud(localSnap, cloudSnap);
  const cL = getBackupCompareLabel(localSnap, cloudSnap);
  const devicesFromMeta = (() => {
    const set = new Map();
    safe.forEach(it => {
      const id = String(it?.sourceDeviceStableId || '').trim();
      if (!id) return;
      if (!set.has(id)) set.set(id, {
        key: id,
        label: String(it?.sourceDeviceLabel || '').trim() || 'Устройство',
        cls: String(it?.sourceDeviceClass || '').trim() || ''
      });
    });
    return [...set.values()];
  })();

  const renderItems = () => safe.map((it, i) => `
    <label class="fresh-row" data-path="${esc(it.path || '')}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:10px;cursor:pointer;margin-bottom:6px">
      <input type="radio" name="fresh-ver" value="${i}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--secondary-color)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#fff">${it.isLatest ? '☁ Latest' : '🕘 Архив'} · ${it.timestamp ? new Date(it.timestamp).toLocaleString('ru-RU') : '—'}</div>
        <div style="font-size:11px;color:#9db7dd">${esc(it.sizeHuman || '')}${it.appVersion ? ` · v${esc(it.appVersion)}` : ''}</div>
      </div>
    </label>`).join('') || '<div class="fav-empty">Облачных версий пока нет</div>';

  const renderDevices = () => devicesFromMeta.length
    ? devicesFromMeta.map((d, i) => `
        <label class="fresh-dev" data-key="${esc(d.key)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.25);border-radius:999px;margin:0 6px 6px 0;cursor:pointer">
          <input type="radio" name="fresh-dev" value="${i}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--secondary-color)">
          <span style="font-size:12px;color:#eaf2ff">${esc(d.label)}${d.cls ? ` · ${esc(d.cls)}` : ''}</span>
        </label>`).join('')
    : '<div style="font-size:12px;color:#9db7dd">У вас ещё нет ни одного устройства в облаке.</div>';

  const bodyHtml = `
    <div style="font-size:13px;color:#9db7dd;margin-bottom:10px">Мы нашли облачную копию аккаунта. Что сделать?</div>
    <div style="display:flex;gap:10px;margin:10px 0;text-align:center">
      <div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 8px">
        <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">💾 На устройстве</div>
        <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${safeNum(localSnap.level || 1)} <span style="color:#ff9800">(${safeNum(localSnap.xp || 0)} XP)</span></div>
        <div style="font-size:11px;color:#eaf2ff">🏆 ${safeNum(localSnap.achievementsCount)} · ⭐ ${safeNum(localSnap.favoritesCount)}</div>
      </div>
      <div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.25);border-radius:12px;padding:10px 8px">
        <div style="font-size:10px;color:#8ab8fd;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">☁️ В облаке</div>
        <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${safeNum(cloudSnap.level || 1)} <span style="color:#ff9800">(${safeNum(cloudSnap.xp || 0)} XP)</span></div>
        <div style="font-size:11px;color:#eaf2ff">🏆 ${safeNum(cloudSnap.achievementsCount)} · ⭐ ${safeNum(cloudSnap.favoritesCount)}</div>
      </div>
    </div>
    <div style="font-size:11px;color:#9db7dd;margin-bottom:10px">Сравнение: ${esc(cL)} (${esc(cmp.state)})</div>

    <div style="font-size:12px;font-weight:700;color:#eaf2ff;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.8px">Версия backup</div>
    <div id="fresh-list">${renderItems()}</div>

    <div style="font-size:12px;font-weight:700;color:#eaf2ff;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.8px">Устройства в облаке</div>
    <div id="fresh-dev-list" style="display:flex;flex-wrap:wrap">${renderDevices()}</div>

    <div class="modal-choice-actions" style="margin-top:14px">
      <button type="button" class="modal-action-btn online" data-fresh-act="restore">Восстановить</button>
      ${devicesFromMeta.length ? `<button type="button" class="modal-action-btn" data-fresh-act="new-device">📱 Это новое устройство</button>` : ''}
      <button type="button" class="modal-action-btn" data-fresh-act="later">🔕 Напомнить позже</button>
    </div>
  `;

  const m = window.Modals?.open?.({ title: 'Обнаружена облачная копия', maxWidth: 500, bodyHtml });
  if (!m) return;

  const pickPath = () => {
    const sel = m.querySelector('input[name="fresh-ver"]:checked');
    const idx = sel ? Number(sel.value) : 0;
    return String(safe[idx]?.path || safe[0]?.path || '').trim();
  };
  const pickDeviceKey = () => {
    const sel = m.querySelector('input[name="fresh-dev"]:checked');
    const idx = sel ? Number(sel.value) : 0;
    return devicesFromMeta[idx]?.key || null;
  };

  m.addEventListener('click', e => {
    const btn = e.target.closest('[data-fresh-act]');
    if (!btn) return;
    const act = btn.dataset.freshAct;
    if (act === 'later') { m.remove(); try { onLater?.(); } catch {} }
    else if (act === 'restore') { m.remove(); try { onRestore?.({ pickedPath: pickPath(), inheritDeviceKey: pickDeviceKey() }); } catch {} }
    else if (act === 'new-device') { m.remove(); try { (onNewDevice || onRestore)?.({ pickedPath: pickPath(), inheritDeviceKey: pickDeviceKey(), asNewDevice: true }); } catch {} }
  });
};

export const openManualRestoreHelpModal = (dH, oP) => {
  const m = window.Modals?.open?.({ title: 'Восстановление через файл', maxWidth: 480, bodyHtml: `<div class="modal-confirm-text">Прямое чтение backup с Яндекс Диска заблокировано CORS браузера.<br><br>Дальше есть 2 безопасных варианта:<ol style="margin:10px 0 0 18px;color:#eaf2ff;line-height:1.5"><li>Скачать backup-файл с Яндекс Диска</li><li>Выбрать этот же файл для импорта в приложение</li></ol><div style="margin-top:12px;color:#9db7dd">Импорт всё равно будет разрешён только если текущий Яндекс ID совпадает с владельцем backup.</div></div><div class="modal-choice-actions"><button type="button" class="modal-action-btn online" data-manual-restore="download">Скачать backup</button><button type="button" class="modal-action-btn" data-manual-restore="pick">Выбрать файл</button></div>` });
  m?.addEventListener('click', e => { const b = e.target.closest('[data-manual-restore]'), a = b?.dataset.manualRestore; if (a === 'download' && dH) window.open(dH, '_blank', 'noopener'); if (a === 'pick') oP?.(); });
};

export default { openBackupInfoModal, openBackupFoundModal, openRestorePreviewModal, openRestoreVersionPickerModal, openManualRestoreHelpModal, openFreshLoginRestoreModal };
