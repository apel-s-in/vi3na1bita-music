// scripts/app/navigation.js
// Управление навигацией, галереей обложек, историей

import { APP_CONFIG } from '../core/config.js';

class NavigationManager {
  constructor() {
    this.currentGalleryIndex = 0;
    this.galleryItems = [];
    this.currentAlbumKey = null;
    this.isTransitioning = false;
    this.touchStartX = 0;
    this.touchEndX = 0;
  }

  initGallery(albumKey, albumData) {
    this.currentAlbumKey = albumKey;
    this.currentGalleryIndex = 0;
    this.galleryItems = [];

    // Определить путь к галерее
    const galleryFolder = APP_CONFIG.ALBUM_GALLERY_MAP[albumKey];
    if (!galleryFolder) {
      this.disableGalleryNavigation();
      return;
    }

    const galleryBase = `${APP_CONFIG.CENTRAL_GALLERY_BASE}${galleryFolder}/`;

    // Собрать элементы галереи
    this.galleryItems = [
      { type: 'cover', url: albumData.cover || 'cover.jpg' }
    ];

    // Добавить iframe если есть
    if (albumData.iframe_url) {
      this.galleryItems.push({
        type: 'iframe',
        url: albumData.iframe_url
      });
    }

    // Добавить изображения галереи (1.jpg, 2.jpg, ...)
    const galleryCount = albumData.gallery_count || 0;
    for (let i = 1; i <= galleryCount; i++) {
      this.galleryItems.push({
        type: 'image',
        url: `${galleryBase}${i}.jpg`
      });
    }

    if (this.galleryItems.length > 1) {
      this.enableGalleryNavigation();
      this.attachGalleryListeners();
    } else {
      this.disableGalleryNavigation();
    }

    this.showGalleryItem(0);
  }

  enableGalleryNavigation() {
    const wrap = document.getElementById('cover-wrap');
    if (wrap) {
      wrap.classList.add('gallery-nav-ready');
    }
  }

  disableGalleryNavigation() {
    const wrap = document.getElementById('cover-wrap');
    if (wrap) {
      wrap.classList.remove('gallery-nav-ready');
    }
  }

  attachGalleryListeners() {
    const leftBtn = document.getElementById('cover-gallery-arrow-left');
    const rightBtn = document.getElementById('cover-gallery-arrow-right');
    const coverSlot = document.getElementById('cover-slot');

    // Кнопки
    leftBtn?.removeEventListener('click', this.boundPrev);
    rightBtn?.removeEventListener('click', this.boundNext);
    
    this.boundPrev = () => this.previousGalleryItem();
    this.boundNext = () => this.nextGalleryItem();
    
    leftBtn?.addEventListener('click', this.boundPrev);
    rightBtn?.addEventListener('click', this.boundNext);

    // Свайп
    if (coverSlot) {
      coverSlot.removeEventListener('touchstart', this.boundTouchStart);
      coverSlot.removeEventListener('touchend', this.boundTouchEnd);
      
      this.boundTouchStart = (e) => {
        this.touchStartX = e.changedTouches[0].screenX;
      };
      
      this.boundTouchEnd = (e) => {
        this.touchEndX = e.changedTouches[0].screenX;
        this.handleSwipe();
      };
      
      coverSlot.addEventListener('touchstart', this.boundTouchStart, { passive: true });
      coverSlot.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    }

    // Клавиши
    document.removeEventListener('keydown', this.boundKeyHandler);
    this.boundKeyHandler = (e) => this.handleKeyNavigation(e);
    document.addEventListener('keydown', this.boundKeyHandler);
  }

  handleSwipe() {
    const diff = this.touchStartX - this.touchEndX;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        this.nextGalleryItem();
      } else {
        this.previousGalleryItem();
      }
    }
  }

  handleKeyNavigation(e) {
    if (this.galleryItems.length <= 1) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.previousGalleryItem();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.nextGalleryItem();
    }
  }

  previousGalleryItem() {
    if (this.isTransitioning || this.galleryItems.length <= 1) return;
    
    this.currentGalleryIndex = 
      (this.currentGalleryIndex - 1 + this.galleryItems.length) % this.galleryItems.length;
    
    this.showGalleryItem(this.currentGalleryIndex);
  }

  nextGalleryItem() {
    if (this.isTransitioning || this.galleryItems.length <= 1) return;
    
    this.currentGalleryIndex = 
      (this.currentGalleryIndex + 1) % this.galleryItems.length;
    
    this.showGalleryItem(this.currentGalleryIndex);
  }

  showGalleryItem(index) {
    if (this.isTransitioning) return;
    
    const item = this.galleryItems[index];
    if (!item) return;

    const coverSlot = document.getElementById('cover-slot');
    if (!coverSlot) return;

    this.isTransitioning = true;

    // Плавное исчезновение
    coverSlot.style.opacity = '0';
    coverSlot.style.transition = 'opacity 0.2s ease-out';

    setTimeout(() => {
      // Отрисовка нового контента
      if (item.type === 'iframe') {
        coverSlot.innerHTML = `
          <iframe 
            src="${item.url}" 
            frameborder="0" 
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen
            loading="lazy"
          ></iframe>
        `;
      } else {
        // image или cover
        const albumInfo = window.albumsIndex?.find(a => a.key === this.currentAlbumKey);
        const baseUrl = albumInfo?.base || '';
        const imgUrl = item.type === 'cover' ? `${baseUrl}${item.url}` : item.url;
        
        coverSlot.innerHTML = `<img src="${imgUrl}" alt="Изображение ${index + 1}" draggable="false">`;
      }

      // Плавное появление
      setTimeout(() => {
        coverSlot.style.opacity = '1';
        this.isTransitioning = false;
      }, 50);
    }, 200);
  }

  cleanup() {
    // Очистка слушателей при размонтировании
    const leftBtn = document.getElementById('cover-gallery-arrow-left');
    const rightBtn = document.getElementById('cover-gallery-arrow-right');
    const coverSlot = document.getElementById('cover-slot');

    leftBtn?.removeEventListener('click', this.boundPrev);
    rightBtn?.removeEventListener('click', this.boundNext);
    
    if (coverSlot) {
      coverSlot.removeEventListener('touchstart', this.boundTouchStart);
      coverSlot.removeEventListener('touchend', this.boundTouchEnd);
    }

    document.removeEventListener('keydown', this.boundKeyHandler);
  }
}

// Глобальный экземпляр
window.NavigationManager = new NavigationManager();

export default NavigationManager;

