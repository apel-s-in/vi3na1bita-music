export class ShareGenerator {
  static async generateAndShare(type, track, stats = {}) {
    if (!window.NotificationSystem) return;
    window.NotificationSystem.info('Создание карточки...');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1080;
      const ctx = canvas.getContext('2d');

      // Фон
      const grad = ctx.createLinearGradient(0, 0, 0, 1080);
      grad.addColorStop(0, '#131a26'); grad.addColorStop(1, '#0b0e15');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);

      // Обложка трека
      const img = new Image(); img.crossOrigin = 'Anonymous';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = track?.cover || 'img/logo.png'; });
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 40;
      ctx.drawImage(img, 140, 150, 800, 800);
      ctx.shadowBlur = 0;

      // Текст
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 70px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(type === 'achievement' ? '🏆 ДОСТИЖЕНИЕ ПОЛУЧЕНО' : (track?.title || 'Без названия'), 540, 100);
      
      ctx.fillStyle = '#8ab8fd'; ctx.font = '50px sans-serif';
      ctx.fillText(track?.artist || 'Витрина Разбита', 540, 990);

      canvas.toBlob(async (blob) => {
        const file = new File([blob], 'share.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
           await navigator.share({ title: 'Витрина Разбита', files: [file] });
        } else {
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a'); a.href = url; a.download = `VR_Share.png`; a.click();
           window.NotificationSystem.success('Карточка сохранена!');
        }
      }, 'image/png', 0.9);
    } catch (e) {
      window.NotificationSystem.error('Ошибка создания карточки');
    }
  }
}
