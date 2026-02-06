/**
 * R3 Modals — модалки для 100% OFFLINE режима
 * 7.5.4: "Трек не найден в 100% OFFLINE"
 * 11.2.I.10: "Включён 100% OFFLINE. Хотите добавить трек?"
 */

let _modal = null;

function showTrackNotFound(message) {
  _ensure();
  _modal.innerHTML = `
<div class="r3m-content">
  <h3>100% OFFLINE</h3>
  <p>${message || 'Трек не найден в 100% OFFLINE. Откройте настройки 100% OFFLINE.'}</p>
  <div class="r3m-actions">
    <button class="r3m-btn" data-r3="settings">Открыть настройки</button>
    <button class="r3m-btn" data-r3="ok">ОК</button>
  </div>
</div>`;
  _modal.style.display = 'flex';
  _modal.onclick = _handleClick;
}

function showAddTrackPrompt(uid, trackTitle) {
  _ensure();
  _modal.innerHTML = `
<div class="r3m-content">
  <h3>100% OFFLINE</h3>
  <p>Включён 100% OFFLINE. Хотите добавить трек "${trackTitle || uid}" в офлайн?</p>
  <div class="r3m-actions">
    <button class="r3m-btn" data-r3="dl-wifi" data-uid="${uid}">Скачать по Wi-Fi</button>
    <button class="r3m-btn" data-r3="dl-any" data-uid="${uid}">Скачать (любая сеть)</button>
    <button class="r3m-btn" data-r3="settings">Открыть настройки 100% OFFLINE</button>
  </div>
</div>`;
  _modal.style.display = 'flex';
  _modal.onclick = _handleClick;
}

function hide() {
  if (_modal) _modal.style.display = 'none';
}

function _ensure() {
  if (_modal) return;
  _modal = document.createElement('div');
  _modal.id = 'r3-modal';
  _modal.className = 'r3m-overlay';
  _modal.style.display = 'none';
  document.body.appendChild(_modal);
}

function _handleClick(e) {
  const act = e.target.dataset.r3;
  if (!act) return;

  if (act === 'ok') { hide(); return; }
  if (act === 'settings') {
    hide();
    window.dispatchEvent(new CustomEvent('openOfflineModal'));
    return;
  }
  if (act === 'dl-wifi' || act === 'dl-any') {
    const uid = e.target.dataset.uid;
    if (uid) {
      window.dispatchEvent(new CustomEvent('r3AddTrack', {
        detail: { uid, wifiOnly: act === 'dl-wifi' }
      }));
    }
    hide();
    return;
  }
}

export { showTrackNotFound, showAddTrackPrompt, hide };
