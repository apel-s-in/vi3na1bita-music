export class ShareGenerator {
  static async generateAndShare(trackTitle, artist, coverUrl) {
    if (!window.NotificationSystem) return;
    window.NotificationSystem.info('Генерация карточки...');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');

      // 1. Рисуем фон (градиент)
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, '#1a1a2e');
      grad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // 2. Грузим обложку (с обходом CORS через Blob, если она локальная)
      const img = new Image();
      img.crossOrigin = 'Anonymous'; // Защита от tainted canvas
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = coverUrl || 'img/logo.png';
      });

      // 3. Рисуем обложку по центру (тень + скругление имитируем)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 60;
      ctx.drawImage(img, 140, 400, 800, 800);
      ctx.shadowBlur = 0; // Сброс тени

      // 4. Текст
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(trackTitle || 'Без названия', 540, 1350, 900);

      ctx.fillStyle = '#8ab8fd';
      ctx.font = '50px sans-serif';
      ctx.fillText(artist || 'Витрина Разбита', 540, 1440, 900);

      // Логотип приложения внизу
      ctx.fillStyle = '#4daaff';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('Слушаю в приложении "Витрина Разбита"', 540, 1800);

      // 5. Экспорт и Шеринг
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Blob is empty');
        const file = new File([blob], 'now_playing.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
           await navigator.share({
             title: 'Слушаю сейчас',
             text: `${trackTitle} - ${artist}`,
             files: [file]
           });
        } else {
           // Fallback: Скачивание
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = `${trackTitle}.png`;
           a.click();
           URL.revokeObjectURL(url);
           window.NotificationSystem.success('Карточка сохранена!');
        }
      }, 'image/png', 0.9);

    } catch (e) {
      console.error(e);
      window.NotificationSystem.error('Ошибка создания карточки');
    }
  }
}
