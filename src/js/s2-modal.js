/**
 * S2 Modal — окно выбора при потере сети (ТЗ 7.5.3.7)
 * "Ожидать" / "Пропустить (играть офлайн)" / "Рекомендация"
 */

let _modal = null;
let _callbacks = null;

function show(options) {
  _callbacks = options;
  _ensureDOM();
  _render(options);
  _modal.style.display = 'flex';
}

function hide() {
  if (_modal) _modal.style.display = 'none';
  _callbacks = null;
}

function _ensureDOM() {
  if (_modal) return;
  _modal = document.createElement('div');
  _modal.id = 's2-modal';
  _modal.className = 's2-overlay';
  _modal.style.display = 'none';
  document.body.appendChild(_modal);
}

function _render(options) {
  const { hasLocalTracks } = options;

  let skipHtml;
  if (hasLocalTracks) {
    skipHtml = `<button class="s2-btn s2-btn-skip" data-s2="skip">Пропустить (играть офлайн)</button>`;
  } else {
    skipHtml = `
      <div class="s2-recommend">
        <p>Нет доступных офлайн-треков.</p>
        <p>Закрепите треки 🔒, используйте OFFLINE modal или включите 100% OFFLINE.</p>
        <button class="s2-btn s2-btn-settings" data-s2="settings">Открыть настройки OFFLINE</button>
      </div>`;
  }

  _modal.innerHTML = `
<div class="s2-content">
  <h3>Сеть недоступна</h3>
  <p>Не удалось загрузить следующий трек.</p>
  <div class="s2-actions">
    <button class="s2-btn s2-btn-wait" data-s2="wait">Ожидать ответ от сети</button>
    ${skipHtml}
  </div>
</div>`;

  _modal.addEventListener('click', _handleClick);
}

function _handleClick(e) {
  const act = e.target.dataset.s2;
  if (!act || !_callbacks) return;

  if (act === 'wait' && _callbacks.onWait) {
    _callbacks.onWait();
    hide();
  } else if (act === 'skip' && _callbacks.onSkip) {
    _callbacks.onSkip();
    hide();
  } else if (act === 'settings' && _callbacks.onOpenOfflineSettings) {
    _callbacks.onOpenOfflineSettings();
    hide();
  }
}

export { show, hide };
