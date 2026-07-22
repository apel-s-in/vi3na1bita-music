// Локальные stats/achievements/favorites принадлежат одному Yandex ID.
// Модуль ничего не удаляет и никогда не управляет playback.

import { metaDB } from './meta-db.js';

const OWNER_KEY = 'account:data-owner:v1';
const PROMPT_KEY = 'account:data-owner-prompt:v1';

const safe = value =>
  String(value == null ? '' : value).trim();

const readCurrentYandexId = () =>
  safe(
    window.YandexAuth
      ?.getProfile?.()
      ?.yandexId
  );

const readCachedCloudOwner = () => {
  try {
    const raw =
      localStorage.getItem('yandex:last_backup_meta') ||
      localStorage.getItem('yandex:last_backup_check') ||
      'null';

    return safe(JSON.parse(raw)?.ownerYandexId);
  } catch {
    return '';
  }
};

export const getLocalDataOwner = () =>
  safe(localStorage.getItem(OWNER_KEY));

export const bindLocalDataOwner = yandexId => {
  const owner = safe(yandexId);

  if (!owner) {
    throw new Error('local_data_owner_required');
  }

  localStorage.setItem(OWNER_KEY, owner);
  sessionStorage.removeItem(PROMPT_KEY);

  window.dispatchEvent(new CustomEvent(
    'account:data-owner-bound',
    {
      detail: {
        ownerYandexId: owner
      }
    }
  ));

  return owner;
};

const hasSharedStorageData = () => {
  try {
    const favorites = JSON.parse(
      localStorage.getItem('__favorites_v2__') ||
      '[]'
    );
    const playlists = JSON.parse(
      localStorage.getItem('sc3:playlists') ||
      '[]'
    );

    return (
      (Array.isArray(favorites) && favorites.length > 0) ||
      (Array.isArray(playlists) && playlists.length > 0)
    );
  } catch {
    return true;
  }
};

export const hasMeaningfulLocalAccountData = async () => {
  if (hasSharedStorageData()) return true;

  const [
    stats,
    hot,
    warm,
    achievements
  ] = await Promise.all([
    metaDB.getAllStats().catch(() => []),
    metaDB.getEvents('events_hot').catch(() => []),
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getGlobal('unlocked_achievements')
      .catch(() => null)
  ]);

  return (
    stats.some(row => row?.uid && row.uid !== 'global') ||
    hot.length > 0 ||
    warm.length > 0 ||
    Object.keys(achievements?.value || {}).length > 0
  );
};

export const assertLocalDataOwner = async ({
  allowEmptyBinding = true
} = {}) => {
  const current = readCurrentYandexId();

  if (!current) {
    throw new Error('local_data_owner_auth_required');
  }

  const owner = getLocalDataOwner();

  if (owner) {
    if (owner !== current) {
      throw new Error('local_data_owner_mismatch');
    }

    return {
      ok: true,
      ownerYandexId: owner,
      newlyBound: false
    };
  }

  const cachedOwner = readCachedCloudOwner();

  if (cachedOwner) {
    if (cachedOwner !== current) {
      throw new Error('local_data_owner_mismatch');
    }

    bindLocalDataOwner(current);

    return {
      ok: true,
      ownerYandexId: current,
      newlyBound: true
    };
  }

  const meaningful =
    await hasMeaningfulLocalAccountData();

  if (meaningful || !allowEmptyBinding) {
    throw new Error('local_data_owner_confirmation_required');
  }

  bindLocalDataOwner(current);

  return {
    ok: true,
    ownerYandexId: current,
    newlyBound: true
  };
};

const showBoundaryModal = async () => {
  const current = readCurrentYandexId();
  if (!current) return false;

  const owner = getLocalDataOwner();

  if (owner && owner !== current) {
    const promptId = `${owner}:${current}`;

    if (sessionStorage.getItem(PROMPT_KEY) === promptId) {
      return false;
    }

    sessionStorage.setItem(PROMPT_KEY, promptId);

    window.Modals?.open?.({
      title: 'Защита прогресса аккаунта',
      maxWidth: 420,
      bodyHtml: `
        <div class="modal-confirm-text">
          На этом устройстве сохранён локальный прогресс
          другого Яндекс-аккаунта.<br><br>
          Он не будет загружен в текущий аккаунт.
          Кошелёк и магазин продолжат работать отдельно.<br><br>
          Чтобы вернуться к прежней статистике, войдите
          в исходный аккаунт. Безопасное переключение
          локальных профилей будет добавлено следующим этапом.
        </div>
      `
    });

    return false;
  }

  try {
    await assertLocalDataOwner();
    return true;
  } catch (error) {
    if (
      error?.message !==
      'local_data_owner_confirmation_required'
    ) {
      return false;
    }
  }

  if (
    sessionStorage.getItem(PROMPT_KEY) === current ||
    !window.Modals?.confirm
  ) {
    return false;
  }

  sessionStorage.setItem(PROMPT_KEY, current);

  window.Modals.confirm({
    title: 'Привязать локальный прогресс?',
    textHtml:
      'На устройстве уже есть статистика, достижения, ' +
      'избранное или плейлисты.<br><br>' +
      'Привязать эти данные к текущему Яндекс-аккаунту? ' +
      'После привязки их нельзя будет загрузить в другой аккаунт.',
    confirmText: 'Привязать',
    cancelText: 'Не загружать',
    onConfirm: () => {
      bindLocalDataOwner(current);
      window.NotificationSystem?.success?.(
        'Локальный прогресс привязан к аккаунту'
      );
    }
  });

  return false;
};

export const initAccountDataBoundary = () => {
  window.addEventListener(
    'yandex:auth:changed',
    event => {
      if (event.detail?.status === 'active') {
        showBoundaryModal().catch(() => null);
      }
    }
  );

  if (
    window.YandexAuth?.getSessionStatus?.() === 'active'
  ) {
    showBoundaryModal().catch(() => null);
  }
};

export default {
  getLocalDataOwner,
  bindLocalDataOwner,
  hasMeaningfulLocalAccountData,
  assertLocalDataOwner,
  initAccountDataBoundary
};
