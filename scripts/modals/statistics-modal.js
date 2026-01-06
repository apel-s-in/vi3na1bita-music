//=================================================
// FILE: scripts/modals/statistics-modal.js
function openStatisticsModal() {
  const data = statsManager.getAllGlobal();

  const content = document.createElement('div');
  content.innerHTML = `<p>Общее время прослушивания: ${formatSeconds(data.totalSeconds)}</p>`;

  const list = document.createElement('div');
  data.tracks.forEach(t => {
    const item = document.createElement('div');
    item.className = 'vr-modal__row';
    item.innerHTML = `<span>${W.config.tracks.find(tr => tr.uid === t.uid)?.title || t.uid}</span>
                      <span>${t.fullCount} full • ${formatSeconds(t.seconds)}</span>`;
    list.appendChild(item);
  });
  content.appendChild(list);

  Modal.open({
    title: 'Статистика',
    content,
    buttons: [{ text: 'Закрыть' }]
  });
}

function formatSeconds(sec) {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  return `${days ? days + ' дн ' : ''}${hours} ч`;
}
