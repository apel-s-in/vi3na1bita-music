// scripts/ui/bindings.js (ESM)
// Единственный делегированный обработчик кликов для UI-кнопок/модалок.
// Цель: убрать inline-обработчики и прямые .onclick, обеспечить CSP-safe поведение.
// Воспроизведение не трогаем: никакие действия этого файла не останавливают плеер,
// кроме вызовов уже существующих функций по нажатию соответствующих кнопок Плеера.

(function () {
  const has = (fn) => typeof fn === 'function';
  const call = (name, ...args) => {
    try {
      const fn = window[name];
      if (typeof fn === 'function') return fn(...args);
    } catch {}
  };
  const textOf = (el) => (el ? (el.textContent || '').trim().toLowerCase() : '');

  // Делегирование кликов по всему документу
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    // ========= Промокод (вход) =========
    if (t.closest('#promo-btn')) {
      e.preventDefault();
      call('checkPromo');
      return;
    }

    // ========= Нижние кнопки / общие действия =========

    // Скрыть/показать не отмеченные ⭐ песни
    if (t.closest('#filter-favorites-btn')) {
      e.preventDefault();
      call('toggleFavoritesFilter');
      return;
    }

    // Логотип снизу (анимация «тычка»)
    if (t.closest('#logo-bottom')) {
      e.preventDefault();
      call('handleLogoClick');
      return;
    }

    // Установка PWA — вешается отдельно при beforeinstallprompt; здесь не вмешиваемся

    // Скачать весь альбом
    if (t.closest('#download-album-main')) {
      e.preventDefault();
      call('openAlbumDownloadModal');
      return;
    }

    // Горячие клавиши (десктоп)
    if (t.closest('#hotkeys-btn')) {
      e.preventDefault();
      call('showHotkeysModal');
      return;
    }

    // О системе (десктоп)
    if (t.closest('#sysinfo-btn')) {
      e.preventDefault();
      call('showSystemInfo');
      return;
    }

    // OFFLINE: обычный клик переключает оффлайн-режим;
    // alt/meta/right‑click/долгое касание — меню профиля обрабатывает scripts/ui/offline.js
    const offBtn = t.closest('#offline-btn');
    if (offBtn) {
      // Предохранители: не обрабатывать alt/meta/ctrl и не мешать меню профилей
      const ev = e;
      const mod = (ev && (ev.altKey || ev.metaKey || ev.ctrlKey));
      if (!mod) {
        e.preventDefault();
        call('offlineUIClick');
      }
      return;
    }

    // ========= Обратная связь =========

    // Открыть модалку «Обратная связь»
    if (t.closest('#feedback-link')) {
      e.preventDefault();
      call('openFeedbackModal');
      return;
    }

    // Закрыть модалку «Обратная связь» по крестику (data-action)
    if (t.closest('[data-action="close-feedback"]')) {
      e.preventDefault();
      call('closeFeedbackModal');
      return;
    }

    // Клик по подложке «Обратная связь» — закрыть (сохраняем прежнюю логику)
    const fbModalBg = t.closest('#modal-feedback');
    if (fbModalBg && t === fbModalBg) {
      e.preventDefault();
      call('closeFeedbackModal');
      return;
    }

    // ========= Плеер (download) — вспомогательные кнопки в renderLyricsBlock =========

    // «Скачать песню» рядом с караоке (якорь с id=download-open)
    if (t.closest('#download-open')) {
      e.preventDefault();
      call('openDownloadModal', e);
      return;
    }

    // ========= Модалка «Скачать трек» (download-modal) =========
    // Примечание: в разметке много кнопок без id. Обрабатываем по тексту.
    // Если позже добавите data-action на кнопки — эта логика не помешает.
    const dlm = t.closest('#download-modal');
    if (dlm) {
      const btn = t.closest('button');
      if (!btn) return;
      const label = textOf(btn);

      // Сохранить на устройство
      if (label.includes('сохранить на устройство')) {
        e.preventDefault();
        call('downloadCurrentTrack');
        return;
      }
      // Поделиться с друзьями
      if (label.includes('поделиться')) {
        e.preventDefault();
        call('shareCurrentTrack');
        return;
      }
      // Открыть в приложении
      if (label.includes('открыть в приложении')) {
        e.preventDefault();
        call('openInAppCurrentTrack');
        return;
      }
      // Скопировать ссылку
      if (label.includes('скопировать ссылку')) {
        e.preventDefault();
        call('copyLinkCurrentTrack');
        return;
      }
      // Скачать весь альбом
      if (label.includes('скачать весь альбом')) {
        e.preventDefault();
        call('openAlbumDownloadModal');
        return;
      }
      // Отмена
      if (label.includes('отмена')) {
        e.preventDefault();
        call('closeDownloadModal');
        return;
      }
      return;
    }

    // ========= Модалка «Скачать альбом» (albumDownloadModal) =========
    const adm = t.closest('#albumDownloadModal');
    if (adm) {
      const btn = t.closest('button');
      if (!btn) return;
      const label = textOf(btn);
      // Отмена
      if (label.includes('отмена')) {
        e.preventDefault();
        call('closeAlbumDownloadModal');
        return;
      }
      // СКАЧАТЬ
      if (label.includes('скачать')) {
        e.preventDefault();
        call('prepareDownload');
        return;
      }
      return;
    }

    // ========= Подтверждение размера архива (sizeConfirmModal) =========
    const scm = t.closest('#sizeConfirmModal');
    if (scm) {
      const btn = t.closest('button');
      if (!btn) return;
      const label = textOf(btn);
      // ОТМЕНА
      if (label.includes('отмена')) {
        e.preventDefault();
        call('closeSizeConfirmModal');
        return;
      }
      // СКАЧАТЬ
      if (label.includes('скачать')) {
        e.preventDefault();
        call('startDownload');
        return;
      }
      return;
    }

    // ========= Прогресс подготовки архива (downloadProgressModal) =========
    // Закрытие происходит автоматически; ручного закрытия нет — пропускаем.

    // ========= Лирика — часть действий уже делегируются в scripts/ui/modals.js =========
    // Добавим подстраховку: если по каким-то причинам не подключился модуль модалок,
    // обработаем data-action здесь же.
    const actBtn = t.closest('#lyrics-text-modal [data-action]');
    if (actBtn) {
      const act = actBtn.getAttribute('data-action');
      switch (act) {
        case 'copy-lyrics':     e.preventDefault(); call('copyLyricsFromModal'); return;
        case 'share-lyrics':    e.preventDefault(); call('shareLyricsFromModal'); return;
        case 'zoom--':          e.preventDefault(); call('zoomLyrics', -1); return;
        case 'zoom++':          e.preventDefault(); call('zoomLyrics', 1); return;
        case 'fs-toggle':       e.preventDefault(); call('toggleLyricsFullscreen'); return;
        case 'close-lyrics-modal': e.preventDefault(); call('closeLyricsModal'); return;
      }
    }

    // ========= Закрытие любых «.modal-bg» по Esc обрабатывается глобально (keydown) =========
  });

  // Дополнительно: предотвращаем скролл к верху для ссылок вида href="#"
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const a = t.closest('a[href="#"]');
    if (a) e.preventDefault();
  });

  // Поддержка «правого клика / Alt+клика» по OFFLINE — меню профилей (см. scripts/ui/offline.js)
  // Здесь ничего не делаем, чтобы не конфликтовать: offline.js уже вешает свои обработчики.
})();
