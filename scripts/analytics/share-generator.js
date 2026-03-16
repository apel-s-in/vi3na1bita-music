// UID.039_(Share cards from profile)_(сделать карточки умнее и богаче)_(future использовать scripts/intel/track/track-presentation.js и relation/reason data)
// UID.052_(Track badges and completion)_(добавить collectible badges в sharing)_(future подмешивать collection state пользователя)
// UID.068_(Public playlist analytics)_(готовить социальный слой карточек и плейлистов)_(future логировать views/saves/share conversions отдельно)
export class ShareGenerator {
  static async generateAndShare(type, track, stats = {}) {
    if (!window.NotificationSystem) return; window.NotificationSystem.info('Создание карточки...');
    try {
      const cvs = document.createElement('canvas'), ctx = cvs.getContext('2d'); cvs.width = cvs.height = 1080;
      const g = ctx.createLinearGradient(0, 0, 0, 1080); g.addColorStop(0, '#131a26'); g.addColorStop(1, '#0b0e15'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1080);

      const img = new Image(); img.crossOrigin = 'Anonymous';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = track?.cover || 'img/logo.png'; });
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 40; ctx.drawImage(img, 140, 150, 800, 800); ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 70px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(type === 'achievement' ? '🏆 ДОСТИЖЕНИЕ ПОЛУЧЕНО' : (track?.title || 'Без названия'), 540, 100);
      ctx.fillStyle = '#8ab8fd'; ctx.font = '50px sans-serif'; ctx.fillText(track?.artist || 'Витрина Разбита', 540, 990);

      cvs.toBlob(async b => {
        const f = new File([b], 'share.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ title: 'Витрина Разбита', files: [f] });
        else { const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = `VR_Share.png`; a.click(); window.NotificationSystem.success('Карточка сохранена!'); }
      }, 'image/png', 0.9);
    } catch { window.NotificationSystem.error('Ошибка создания карточки'); }
  }
}
