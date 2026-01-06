//=================================================
// FILE: scripts/modals/offline-modal.js
// Полная OFFLINE modal по секциям A–I + 100% OFFLINE
function openOfflineModal() {
  const content = document.createElement('div');

  // A) Offline mode ON/OFF
  const secA = createSection('Offline mode');
  const offlineSwitch = createSwitch('offline:mode:v1', 'ON', 'OFF', true);
  secA.appendChild(offlineSwitch);
  content.appendChild(secA);

  // B) Cache quality (CQ)
  const secB = createSection('Cache quality');
  const cqRow = document.createElement('div');
  cqRow.className = 'vr-modal__row';
  ['hi', 'lo'].forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'offline-btn';
    btn.textContent = q.toUpperCase();
    btn.style.background = localStorage.getItem('offline:cacheQuality:v1') === q ? '#E80100' : '#333';
    btn.onclick = () => {
      localStorage.setItem('offline:cacheQuality:v1', q);
      toast(`Cache Quality изменён на ${q.toUpperCase()}`, 'info');
      // Помечаем needsReCache
      markAllNeedsReCache();
    };
    cqRow.appendChild(btn);
  });
  secB.appendChild(cqRow);
  content.appendChild(secB);

  // C) Cloud settings (N, D)
  const secC = createSection('Cloud settings');
  secC.appendChild(createInput('offline:cloudN', 'N (full listens)', 'number', 5));
  secC.appendChild(createInput('offline:cloudTTL', 'D (дней)', 'number', 31));
  content.appendChild(secC);

  // D) Network policy
  const secD = createSection('Network policy');
  ['wifi', 'mobile'].forEach(type => {
    const sw = createSwitch(`offline:policy:${type}`, type.toUpperCase(), 'OFF');
    secD.appendChild(sw);
  });
  content.appendChild(secD);

  // E) Cache limit + breakdown (упрощённо)
  const secE = createSection('Cache limit');
  secE.innerHTML += '<p>Auto limit: 2 GB (реализация eviction в offline-manager)</p>';
  content.appendChild(secE);

  // F) Загрузки
  const secF = createSection('Загрузки');
  secF.innerHTML += '<p>Скачивается сейчас: <span id="current-dl">—</span></p>';
  secF.innerHTML += '<p>В очереди: <span id="queue-len">0</span></p>';
  content.appendChild(secF);

  // G) Обновления
  const secG = createSection('Обновления');
  const updateBtn = document.createElement('button');
  updateBtn.className = 'offline-btn';
  updateBtn.textContent = 'Обновить все файлы';
  updateBtn.onclick = () => enqueueAllUpdates();
  secG.appendChild(updateBtn);
  content.appendChild(secG);

  // H) Очистка кэша
  const secH = createSection('Очистка кэша');
  const clearAll = document.createElement('button');
  clearAll.className = 'offline-btn';
  clearAll.style.background = '#ff3333';
  clearAll.textContent = 'Очистить всё (двойной confirm)';
  clearAll.onclick = () => {
    if (confirm('Очистить весь кэш?') && confirm('Точно?')) {
      indexedDB.deleteDatabase('vr-audio-cache');
      localStorage.clear();
      toast('Кэш очищен', 'success');
    }
  };
  secH.appendChild(clearAll);
  content.appendChild(secH);

  // I) 100% OFFLINE
  const secI = createSection('100% OFFLINE');
  const modeSelect = document.createElement('select');
  ['favorites', 'selected-albums'].forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m === 'favorites' ? 'только ИЗБРАННОЕ' : 'выбранные альбомы';
    modeSelect.appendChild(opt);
  });
  secI.appendChild(modeSelect);

  const startBtn = document.createElement('button');
  startBtn.className = 'offline-btn';
  startBtn.textContent = 'Начать 100% OFFLINE';
  startBtn.onclick = async () => {
    const selection = modeSelect.value === 'favorites' ? 'favorites' : { albums: [] }; // для альбомов добавь чекбоксы
    const estimate = await offlineManager.computeSizeEstimate(selection);
    if (estimate.totalMB > availableSpace()) {
      toast('Недостаточно места', 'error');
      return;
    }
    if (navigator.connection?.effectiveType === 'unknown' && !confirm('Тип сети неизвестен. Продолжить?')) return;
    await offlineManager.startFullOffline(selection);
    toast('100% OFFLINE начат', 'success');
  };
  secI.appendChild(startBtn);
  content.appendChild(secI);

  Modal.open({
    title: 'OFFLINE',
    content,
    buttons: [{ text: 'Закрыть', noClose: false }]
  });
}

// Вспомогательные функции
function createSection(title) {
  const sec = document.createElement('div');
  sec.className = 'vr-modal__section';
  const h = document.createElement('h3');
  h.className = 'vr-modal__sectionTitle';
  h.textContent = title;
  sec.appendChild(h);
  return sec;
}

function createSwitch(storageKey, onText, offText, defaultOn = false) {
  const div = document.createElement('div');
  div.className = 'vr-modal__field';
  const label = document.createElement('span');
  label.textContent = storageKey.split(':').pop();
  div.appendChild(label);
  const sw = document.createElement('button');
  sw.className = 'offline-btn';
  const val = localStorage.getItem(storageKey) !== 'false';
  sw.textContent = val ? onText : offText;
  sw.onclick = () => {
    const newVal = !val;
    localStorage.setItem(storageKey, newVal);
    sw.textContent = newVal ? onText : offText;
  };
  div.appendChild(sw);
  return div;
}

function createInput(storageKey, label, type = 'number', def) {
  const div = document.createElement('div');
  div.className = 'vr-modal__field';
  div.innerHTML = `<span>${label}</span><input type="${type}" value="${localStorage.getItem(storageKey) || def}">`;
  div.querySelector('input').onchange = (e) => localStorage.setItem(storageKey, e.target.value);
  return div;
}
