// scripts/app/downloads.js (ESM)
// Полный перенос функций скачивания/архивации из index.html.
// Совместимость: экспорт в window.*. Никаких остановок плеера — только UI.

(function () {
  function getPlayerConfig() {
    try { return (typeof window.getPlayerConfig === 'function') ? window.getPlayerConfig() : null; }
    catch { return null; }
  }

  function getTrackFileName(track, idx, artist) {
    return `${String(idx + 1).padStart(2, '0')} - ${track.title} - ${artist}.mp3`.replace(/[\\/:"*?<>|]+/g, '_');
  }

  function openDownloadModal(e) {
    if (e) e.preventDefault();
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const fn = getTrackFileName(tr, window.playingTrack, pc.artist || 'Витрина Разбита');
    const el = document.getElementById('download-modal-filename');
    if (el) el.innerHTML = `<b>${fn}</b>`;
    document.getElementById('download-modal')?.classList.add('active');
  }

  async function downloadCurrentTrack() {
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const fn = getTrackFileName(tr, window.playingTrack, pc.artist || 'Витрина Разбита');
    const a = document.createElement('a'); a.href = tr.audio; a.download = fn;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); }, 250);
    closeDownloadModal();
    try { window.NotificationSystem && window.NotificationSystem.success('Файл будет загружен!'); } catch {}
  }

  async function shareCurrentTrack() {
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const t = (window.playerCore && window.playerCore.getSeek) ? Math.floor(window.playerCore.getSeek() || 0) : 0;
    const timeParam = t > 10 ? `&time=${t}` : '';
    const shareUrl = location.origin + location.pathname + `?album=${window.playingAlbumKey}&track=${window.playingTrack}${timeParam}`;
    const txt = `🎵 ${tr.title} - ${pc.artist || 'Витрина Разбита'}\n🎧 Слушай:`;
    if (navigator.share) {
      try { await navigator.share({ title: tr.title, text: txt, url: shareUrl }); } catch {}
      try { window.NotificationSystem && window.NotificationSystem.success('Ссылка отправлена!'); } catch {}
      closeDownloadModal();
    } else {
      try { await navigator.clipboard.writeText(`${txt}\n${shareUrl}`); window.NotificationSystem && window.NotificationSystem.success('Ссылка скопирована!'); } catch {}
    }
  }

  function openInAppCurrentTrack() {
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    window.open(tr.audio, '_blank', 'noopener');
    closeDownloadModal();
  }

  function copyLinkCurrentTrack() {
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const directUrl = tr.audio;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(directUrl)
        .then(() => window.NotificationSystem && window.NotificationSystem.success('Прямая ссылка скопирована!'),
              () => window.NotificationSystem && window.NotificationSystem.error('Не удалось скопировать'));
    } else {
      const ta = document.createElement('textarea'); ta.value = directUrl; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); window.NotificationSystem && window.NotificationSystem.success('Прямая ссылка скопирована!'); }
      catch { window.NotificationSystem && window.NotificationSystem.error('Не удалось скопировать'); }
      document.body.removeChild(ta);
    }
    closeDownloadModal();
  }

  function closeDownloadModal() {
    document.getElementById('download-modal')?.classList.remove('active');
  }

  // Модалка «Скачать альбом»
  function openAlbumDownloadModal() {
    document.getElementById('albumDownloadModal')?.classList.add('active');
    try { checkFavoritesAvailable(); } catch {}
  }
  function closeAlbumDownloadModal() {
    document.getElementById('albumDownloadModal')?.classList.remove('active');
  }
  function checkFavoritesAvailable() {
    try {
      const favCheckbox = document.getElementById('onlyFavorites');
      const liked = (typeof window.getLiked === 'function') ? window.getLiked() : [];
      if (!favCheckbox) return;
      favCheckbox.disabled = liked.length === 0;
      favCheckbox.parentElement && (favCheckbox.parentElement.style.opacity = liked.length === 0 ? '.5' : '1');
    } catch {}
  }

  // JSZip
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // Собрать файлы галереи для текущего альбома (локальные пути)
  async function gatherGalleryFilesForAlbum(albumKey) {
    const id = (function () {
      const map = window.ALBUM_GALLERY_MAP || {};
      const allowed = window.CENTRAL_ALLOWED_IDS || new Set();
      const x = map[albumKey] || null;
      return x && (allowed.has ? allowed.has(x) : true) ? x : null;
    })();
    if (!id) return [];
    try {
      const baseDir = `${window.CENTRAL_GALLERY_BASE || './albums/gallery/'}${id}/`;
      const r = await fetch(baseDir + 'index.json', { cache: 'no-cache' });
      if (!r.ok) return [];
      const j = await r.json();
      const arr = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
      const files = [];
      for (const raw of arr) {
        const norm = window.normalizeGalleryItem ? window.normalizeGalleryItem(raw, baseDir) : null;
        if (!norm || norm.type !== 'img') continue;
        const src = norm.formats?.full || norm.src;
        if (src) {
          const name = src.split('/').pop();
          files.push({ url: src, name: `gallery/${name}`, type: 'image' });
        }
      }
      return files;
    } catch { return []; }
  }

  // Накопитель файлов
  let filesToDownload = [];

  async function prepareFilesList() {
    filesToDownload = [];
    const added = new Set();
    const liked = (typeof window.getLiked === 'function') ? window.getLiked() : [];
    let idxs = [];

    const includeCovers = !!document.getElementById('includeCovers')?.checked;
    const includeLyrics = !!document.getElementById('includeLyrics')?.checked;
    const onlyFav = !!document.getElementById('onlyFavorites')?.checked;
    const fullAlbum = !!document.getElementById('fullAlbum')?.checked;

    const cfg = window.config || null;
    if (!cfg || !Array.isArray(cfg.tracks)) return;

    if (onlyFav && liked.length > 0) idxs = liked;
    else if (fullAlbum) idxs = cfg.tracks.map((_, i) => i);

    for (const i of idxs) {
      const t = cfg.tracks[i];
      const num = String(i + 1).padStart(2, '0');
      const name = `${num} - ${t.title} - ${cfg.artist}.mp3`;
      if (!added.has(name) && t.audio) {
        added.add(name);
        filesToDownload.push({ url: t.audio, name, type: 'audio' });
      }
      if (includeLyrics && t.fulltext) {
        const n2 = `${num} - ${t.title} - ${cfg.artist}.txt`;
        if (!added.has(n2)) {
          added.add(n2);
          try {
            const r = await fetch(t.fulltext);
            const text = await r.text();
            filesToDownload.push({ content: text, name: n2, type: 'text' });
          } catch {}
        }
      }
    }

    if (includeCovers) {
      const galleryFiles = await gatherGalleryFilesForAlbum(window.currentAlbumKey);
      for (const f of galleryFiles) {
        if (!added.has(f.name)) {
          added.add(f.name);
          filesToDownload.push(f);
        }
      }
      if (galleryFiles.length === 0) {
        const nm = 'logo.png';
        if (!added.has(nm)) {
          added.add(nm);
          filesToDownload.push({ url: 'img/logo.png', name: nm, type: 'image' });
        }
      }
    }

    if (!added.has('logo.png')) {
      filesToDownload.push({ url: 'img/logo.png', name: 'logo.png', type: 'image' });
    }
    if (!added.has('social.txt')) {
      filesToDownload.push({ content: generateSocialText(), name: 'social.txt', type: 'text' });
    }
  }

  function generateSocialText() {
    const s = (window.config && window.config.socials) ? window.config.socials : [];
    const lines = s.map(one => `${one.title}: ${one.url}`).join('\n');
    return `═══════════════════════════════════════
         ВИТРИНА РАЗБИТА — ${window.config?.albumName || 'Альбом'}
═══════════════════════════════════════

Спасибо за интерес к нашему творчеству!
Поддержите нас и подпишитесь:

${lines}

С любовью, "Витрина Разбита"
═══════════════════════════════════════`;
  }

  async function prepareDownload() {
    await loadJSZip();
    await prepareFilesList();
    if (!filesToDownload.length) {
      try { window.NotificationSystem && window.NotificationSystem.error('Нет файлов для архива'); } catch {}
      return;
    }
    const sizeMB = await calculateArchiveSize();
    const sz = document.getElementById('archiveSize');
    const cnt = document.getElementById('fileCount');
    if (sz) sz.textContent = sizeMB + ' МБ';
    if (cnt) cnt.textContent = filesToDownload.length;
    closeAlbumDownloadModal();
    document.getElementById('sizeConfirmModal')?.classList.add('active');
  }

  function closeSizeConfirmModal() {
    document.getElementById('sizeConfirmModal')?.classList.remove('active');
  }

  async function calculateArchiveSize() {
    let total = 0;
    const promises = [];
    for (const f of filesToDownload) {
      if (f.url) {
        const head = fetch(f.url, { method: 'HEAD' })
          .then(r => { const s = r.headers.get('content-length'); return s ? parseInt(s, 10) : null; })
          .catch(() => null);
        const heur = new Promise(r => setTimeout(() => r(f.type === 'audio' ? 5 * 1024 * 1024 : f.type === 'image' ? 500 * 1024 : 10 * 1024), 500));
        promises.push(Promise.race([head, heur]).then(sz => { if (sz) total += sz; }));
      } else if (f.content) {
        total += new Blob([f.content]).size;
      }
    }
    await Promise.allSettled(promises);
    total = Math.ceil(total * 1.1);
    return (total / 1024 / 1024).toFixed(1);
  }

  function startDownload() {
    document.getElementById('sizeConfirmModal')?.classList.remove('active');
    createAndDownloadZip();
  }

  function showProgressModal() {
    document.getElementById('downloadProgressModal')?.classList.add('active');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    const errs = document.getElementById('errorsList');
    if (fill) fill.style.width = '0%';
    if (text) text.textContent = `Загрузка файлов: 0/${filesToDownload.length}`;
    if (errs) errs.style.display = 'none';
  }

  function updateProgress(done, total) {
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    if (fill) fill.style.width = `${Math.round(done / total * 100)}%`;
    if (text) text.textContent = `Загрузка файлов: ${done}/${total}`;
  }

  function showErrors(errors) {
    if (errors.length) {
      const wrap = document.getElementById('errorsList');
      const ul = document.getElementById('errorsListContent');
      if (wrap) wrap.style.display = 'block';
      if (ul) ul.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    }
  }

  async function createAndDownloadZip() {
    await loadJSZip();
    const zip = new JSZip();
    const errors = [];
    let done = 0;
    showProgressModal();
    const BATCH = 5;

    for (let i = 0; i < filesToDownload.length; i += BATCH) {
      const batch = filesToDownload.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async f => {
        try {
          if (f.url) {
            const r = await fetch(f.url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const b = await r.blob();
            zip.file(f.name, b);
          } else {
            zip.file(f.name, f.content);
          }
          done++; updateProgress(done, filesToDownload.length);
        } catch (e) {
          errors.push(f.name);
          done++; updateProgress(done, filesToDownload.length);
        }
      }));
    }
    if (errors.length) { showErrors(errors); await new Promise(r => setTimeout(r, 1500)); }
    const text = document.getElementById('progressText');
    if (text) text.textContent = 'Создание архива...';

    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, meta => {
      const t = document.getElementById('progressText');
      const f = document.getElementById('progressFill');
      if (t) t.textContent = `Создание архива: ${meta.percent.toFixed(0)}%`;
      if (f) f.style.width = `${meta.percent.toFixed(0)}%`;
    });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    const date = new Date().toISOString().split('T')[0];
    const albumName = (window.config?.albumName || 'album').replace(/[\\/:"*?<>|]+/g, '_');
    a.download = `vitrina-razbita-${albumName}-${date}.zip`;
    a.click();

    setTimeout(() => {
      document.getElementById('downloadProgressModal')?.classList.remove('active');
      URL.revokeObjectURL(a.href);
      try { window.NotificationSystem && window.NotificationSystem.success('Архив скачан!'); } catch {}
    }, 800);
  }

  // Проброс в window.*
  window.openDownloadModal = openDownloadModal;
  window.downloadCurrentTrack = downloadCurrentTrack;
  window.shareCurrentTrack = shareCurrentTrack;
  window.openInAppCurrentTrack = openInAppCurrentTrack;
  window.copyLinkCurrentTrack = copyLinkCurrentTrack;
  window.closeDownloadModal = closeDownloadModal;

  window.openAlbumDownloadModal = openAlbumDownloadModal;
  window.closeAlbumDownloadModal = closeAlbumDownloadModal;
  window.checkFavoritesAvailable = checkFavoritesAvailable;

  window.loadJSZip = loadJSZip;
  window.prepareFilesList = prepareFilesList;
  window.gatherGalleryFilesForAlbum = gatherGalleryFilesForAlbum;
  window.prepareDownload = prepareDownload;
  window.closeSizeConfirmModal = closeSizeConfirmModal;
  window.calculateArchiveSize = calculateArchiveSize;
  window.startDownload = startDownload;
  window.showProgressModal = showProgressModal;
  window.updateProgress = updateProgress;
  window.showErrors = showErrors;
  window.createAndDownloadZip = createAndDownloadZip;
})();
