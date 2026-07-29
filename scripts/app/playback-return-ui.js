// Пользовательская кнопка возврата playback ownership.
// Не запускает музыку автоматически: обычный PlayerCore.play() вызывается только после явного клика.
const safe = value => String(value == null ? '' : value).trim();
let root = null;
let lastDetail = null;
let initialized = false;

const remove = () => {
  root?.remove();
  root = null;
  lastDetail = null;
};

const show = detail => {
  const playback = detail?.playback || {};
  if (!playback.active || !safe(playback.ownerDeviceId)) return;
  lastDetail = detail;
  remove();
  lastDetail = detail;
  root = document.createElement('aside');
  root.className = 'playback-return-banner';
  root.setAttribute('role', 'status');
  root.innerHTML = `<div class="playback-return-banner__icon">↩</div><div class="playback-return-banner__text"><b>Музыка играет на другом устройстве</b><span>${safe(playback.ownerLabel || 'Другое устройство')}</span></div><button type="button" class="playback-return-banner__button">Вернуть сюда</button><button type="button" class="playback-return-banner__close" aria-label="Скрыть">×</button>`;
  document.body.appendChild(root);

  root.querySelector('.playback-return-banner__close')?.addEventListener('click', remove);
  root.querySelector('.playback-return-banner__button')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Запрашиваем…';
    try {
      const result = await window.playerCore?.play?.();
      if (result !== false && window.playerCore?.isPlaying?.()) {
        remove();
        return;
      }
      button.disabled = false;
      button.textContent = 'Вернуть сюда';
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Вернуть сюда';
      window.NotificationSystem?.error?.(`Не удалось вернуть воспроизведение: ${error?.message || 'ошибка'}`);
    }
  });
};

export const initPlaybackReturnUi = () => {
  if (initialized) return;
  initialized = true;
  window.addEventListener('playback:ownership-lost', event => show(event.detail || {}));
  window.addEventListener('playback:ownership-updated', () => {
    if (window.PlaybackOwnership?.getGrant?.()) remove();
  });
  window.addEventListener('player:play', remove);
  window.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status !== 'active') remove();
  });
  window.addEventListener('account:data-switching', remove);
};

export const getPlaybackReturnUiState = () => ({
  visible: !!root?.isConnected,
  ownerDeviceId: safe(lastDetail?.playback?.ownerDeviceId),
  ownerLabel: safe(lastDetail?.playback?.ownerLabel)
});

export default { initPlaybackReturnUi, getPlaybackReturnUiState };
