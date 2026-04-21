// UID.044_(ListenerProfile core)_(подготовить профиль к встраиванию user-intelligence блоков)_(render-shell остаётся legacy host, принимающим optional intel fragments) UID.056_(Recommendation reasons)_(позже принимать explainable rec fragments без knowledge об их расчёте)_(shell только размещает future blocks, но не считает причины) UID.070_(Linked providers)_(показывать provider shell-поверхность без владения identity truth)_(render-shell рендерит auth/provider area, но данные linked accounts приходят извне) UID.072_(Provider consents)_(shell должен уметь принять consent UI блоки)_(но не хранить и не вычислять consent state самостоятельно) UID.073_(Hybrid sync orchestrator)_(shell станет host для sync-role/status block)_(но orchestration logic останется в intel/providers layer) UID.082_(Local truth vs external telemetry split)_(shell не должен экспортировать profile/raw insights сам)_(это только layout/render host) UID.094_(No-paralysis rule)_(profile shell обязан работать без intel fragments)_(если intelligent blocks отсутствуют, legacy profile UI остаётся полноценным) UID.095_(Ownership boundary: legacy vs intel)_(жёстко закрепить render-shell как legacy-shell, принимающий optional intel fragments)_(layout/profile navigation/stat shell здесь, а listener/recs/providers/community insights приходят как надстройка)
// scripts/app/profile/render-shell.js
import { mountProfileCarouselFlat } from './carousel-flat.js';
import { renderProfileSettings } from './settings-view.js';
import { getProfileTemplateHtml } from './template.js';
import { renderYandexAuthBlock } from './yandex-auth-view.js';

// ─── Глобальные слушатели badge — один раз за жизнь страницы ──────────────
let _badgeListenersBound = false;

function _initBadgeListeners() {
  if (_badgeListenersBound) return;
  _badgeListenersBound = true;

  window.addEventListener('yandex:cloud:newer', () => {
    const btn = document.querySelector('.album-icon[data-album="__profile__"]');
    if (!btn || btn.querySelector('.cloud-newer-badge')) return;

    if (!document.getElementById('cloud-badge-style')) {
      const s = document.createElement('style');
      s.id = 'cloud-badge-style';
      s.textContent = `@keyframes badgePop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3);opacity:1}100%{transform:scale(1);opacity:1}}`;
      document.head.appendChild(s);
    }

    btn.style.position = 'relative';
    const parent = btn.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    const badge = Object.assign(document.createElement('span'), {
      className: 'cloud-newer-badge',
      textContent: '!'
    });
    badge.title = 'В облаке есть более новые данные';
    badge.style.cssText = [
      'position:absolute', 'top:-4px', 'right:-4px',
      'width:16px', 'height:16px', 'background:#ff9800',
      'border-radius:50%', 'font-size:10px', 'font-weight:900',
      'color:#000', 'display:flex', 'align-items:center',
      'justify-content:center', 'z-index:10', 'pointer-events:none',
      'animation:badgePop 0.3s cubic-bezier(.34,1.56,.64,1) both'
    ].join(';');
    btn.appendChild(badge);
  });

  window.addEventListener('backup:sync:ready', (e) => {
    const reasons = ['auto_restore', 'cloud_not_newer', 'user_skipped_restore', 'restore_completed', 'manual_save'];
    if (reasons.includes(e.detail?.reason)) {
      document.querySelectorAll('.cloud-newer-badge').forEach(b => b.remove());
    }
  });

  // Fresh-login orchestrator: один раз показываем богатую модалку выбора сценария
  window.addEventListener('yandex:restore:entry', async (e) => {
    try {
      const dt = e.detail || {};
      if (!dt.isFreshLogin || !dt.meta) return;

      const cloudTs = Number(dt.meta?.timestamp || 0);
      const skipKey = `yandex:fresh-restore:entry:${cloudTs}`;
      if (sessionStorage.getItem(skipKey) === '1') return;
      sessionStorage.setItem(skipKey, '1');

      // Блокируем только ту же облачную копию, для которой restore уже был выполнен.
      // Любой новый fresh-login с другим snapshot timestamp обязан показать модалку.
      try {
        const restoreDone = localStorage.getItem('backup:restore_or_skip_done') === '1';
        const localTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
        const sameSnapshot = cloudTs > 0 && localTs > 0 && Math.abs(cloudTs - localTs) < 5000;
        if (restoreDone && sameSnapshot) {
          console.debug('[FreshLoginRestoreEntry] skipped — snapshot already applied');
          return;
        }
      } catch {}

      const ya = window.YandexAuth;
      const token = ya?.getToken?.();
      if (!token || !ya?.isTokenAlive?.()) return;

      const mod = await import('./yandex-modals.js');
      const openFn = mod?.openFreshLoginRestoreModal;
      if (typeof openFn !== 'function') return;

      const YandexDiskMod = await import('../../core/yandex-disk.js');
      const YandexDisk = YandexDiskMod.YandexDisk || YandexDiskMod.default;

      let items = [];
      try { items = await YandexDisk.listBackups(token); } catch {}
      if (!Array.isArray(items) || !items.length) items = [dt.meta];

      const { openYandexRestoreFlow } = await import('./yandex-restore-flow.js');

      openFn({
        meta: dt.meta,
        items,
        onLater: async () => {
          try {
            const se = await import('../../analytics/backup-sync-engine.js');
            se.markSyncReady('user_skipped_restore');
            try { se.markRestoreOrSkipDone('user_skipped_restore'); } catch {}
          } catch {}
        },
        onRestore: async ({ pickedPath, inheritDeviceKey, asNewDevice } = {}) => {
          try {
            await openYandexRestoreFlow({
              token,
              disk: YandexDisk,
              notify: window.NotificationSystem,
              autoPickedPath: pickedPath,
              inheritDeviceKey: inheritDeviceKey || null,
              asNewDevice: !!asNewDevice,
              skipPreview: true,
              applyMode: 'all',
              localProfile: (() => { try { return JSON.parse(localStorage.getItem('profile:last_snapshot') || 'null') || { name: 'Слушатель' }; } catch { return { name: 'Слушатель' }; } })()
            });
          } catch (err) {
            console.warn('[FreshLoginRestore] flow failed', err?.message);
          }
        },
        onNewDevice: async ({ pickedPath, inheritDeviceKey } = {}) => {
          try {
            await openYandexRestoreFlow({
              token,
              disk: YandexDisk,
              notify: window.NotificationSystem,
              autoPickedPath: pickedPath,
              inheritDeviceKey: inheritDeviceKey || null,
              asNewDevice: true,
              skipPreview: true,
              applyMode: 'all',
              localProfile: (() => { try { return JSON.parse(localStorage.getItem('profile:last_snapshot') || 'null') || { name: 'Слушатель' }; } catch { return { name: 'Слушатель' }; } })()
            });
          } catch (err) {
            console.warn('[FreshLoginNewDevice] flow failed', err?.message);
          }
        }
      });
    } catch (err) {
      console.warn('[FreshLoginRestoreEntry] failed:', err?.message);
    }
  });
}

// Инициализируем сразу при импорте — строго один раз
_initBadgeListeners();

// ─── Основная функция рендера профиля ────────────────────────────────────────
export const renderProfileShell = ({
  container: c,
  profile: p,
  tokens: tk,
  totalFull: tF,
  totalSec: tS,
  streak: strk,
  achCount: aC
}) => {
  if (!c) return;

  const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
  const fmt = window.Utils?.fmt;
  const timeStr = fmt?.durationHuman ? fmt.durationHuman(tS || 0) : `${Math.floor((tS || 0) / 60)}м`;
  const since = p?.createdAt
    ? new Date(p.createdAt).toLocaleDateString('ru-RU')
    : (localStorage.getItem('app:first-install-ts')
        ? new Date(Number(localStorage.getItem('app:first-install-ts'))).toLocaleDateString('ru-RU')
        : '—');
  const daysWithUs = p?.createdAt
    ? Math.floor((Date.now() - Number(p.createdAt)) / 86400000)
    : (localStorage.getItem('app:first-install-ts')
        ? Math.floor((Date.now() - Number(localStorage.getItem('app:first-install-ts'))) / 86400000)
        : 0);

  // Рендерим HTML-скелет профиля только один раз.
  // ВАЖНО: повторный full innerHTML здесь убивает/сбрасывает player host внутри #track-list.
  if (!c.querySelector('.profile-wrap')) c.innerHTML = getProfileTemplateHtml();

  // Заполняем начальные данные
  const $ = sel => c.querySelector(sel);

  const avatarBtn = $('#prof-avatar-btn');
  if (avatarBtn) avatarBtn.textContent = p?.avatar || '😎';

  const nameInp = $('#prof-name-inp');
  if (nameInp) nameInp.value = p?.name || 'Слушатель';

  const sinceEl = $('#prof-meta-since');
  if (sinceEl) sinceEl.textContent = `📅 Слушаю с: ${since}`;

  const daysEl = $('#prof-meta-days');
  if (daysEl) daysEl.textContent = `🎵 Дней с нами: ${daysWithUs}`;

  // Быстрая статистика (мини-карточки в tab-stats)
  const statTracks = $('#prof-stat-tracks');
  if (statTracks) statTracks.textContent = String(tF || 0);

  const statTime = $('#prof-stat-time');
  if (statTime) statTime.textContent = timeStr;

  const statStreak = $('#prof-stat-streak');
  if (statStreak) statStreak.textContent = String(strk || 0);

  const statAch = $('#prof-stat-ach');
  if (statAch) statAch.textContent = String(aC || 0);

  // Монтируем 3D-карусель (заменяет заглушку .profile-tabs)
  try {
    mountProfileCarouselFlat({ root: c });
  } catch (e) {
    console.warn('[renderProfileShell] carousel failed:', e);
  }

  // Рендерим настройки
  const settingsTab = $('#tab-settings');
  if (settingsTab) {
    try {
      renderProfileSettings(settingsTab);
    } catch (e) {
      console.warn('[renderProfileShell] settings failed:', e);
    }
  }

  // Рендерим блок Яндекс-авторизации
  const authGrid = $('#prof-auth-grid');
  if (authGrid) {
    try {
      renderYandexAuthBlock({ root: authGrid, localProfile: p });
    } catch (e) {
      console.warn('[renderProfileShell] yandex auth failed:', e);
    }
  }
};

export default { renderProfileShell };
