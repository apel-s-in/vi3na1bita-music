const W = window;
const cardsData = [ { id: 'account', tit: 'Аккаунт', ic: '👤' }, { id: 'stats', tit: 'Статистика', ic: '📊' }, { id: 'achievements', tit: 'Достижения', ic: '🏆' }, { id: 'recs', tit: 'Рекомендации', ic: '💡' }, { id: 'logs', tit: 'Журнал', ic: '📜' }, { id: 'settings', tit: 'Настройки', ic: '⚙️' } ];
const crackCfg = [ { x: -50, y: -60, w: 260, h: 320, r: 15, o: .95 }, { x: -70, y: -20, w: 280, h: 300, r: -10, o: .90 }, { x: -40, y: -30, w: 250, h: 320, r: 175, o: .92 }, { x: -30, y: -80, w: 270, h: 350, r: -25, o: .96 }, { x: -80, y: -50, w: 300, h: 300, r: 45, o: .88 }, { x: -20, y: -30, w: 240, h: 320, r: -5, o: .94 } ];
const makeCrack = i => `<svg viewBox="0 0 160 230" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><image href="img/vitrina-crack-01.svg" x="${crackCfg[i]?.x||-50}" y="${crackCfg[i]?.y||-60}" width="${crackCfg[i]?.w||260}" height="${crackCfg[i]?.h||320}" transform="rotate(${crackCfg[i]?.r||15},${(crackCfg[i]?.x||-50)+(crackCfg[i]?.w||260)/2},${(crackCfg[i]?.y||-60)+(crackCfg[i]?.h||320)/2})" preserveAspectRatio="xMidYMid meet" style="mix-blend-mode:screen;opacity:${crackCfg[i]?.o||.95}"/></svg>`;

export function mountProfileCarouselFlat({ root }) {
  const TOTAL = cardsData.length, STEP = 360 / TOTAL;
  const cardsHtml = cardsData.map((d, i) => `<div class="sc-3d-card" data-idx="${i}" data-id="${d.id}" style="--a:${i * STEP}deg"><div class="glass-halo"></div><div class="glass-face"><div class="surface-content"><div class="sc-3d-ic">${d.ic}</div><div class="sc-3d-tit">${d.tit}</div></div><div class="glass-noise"></div><div class="crack-layer">${makeCrack(i)}</div><div class="glass-3d-edge"></div></div></div>`).join('');
  const wrap = document.createElement('div');
  wrap.className = `sc-3d-wrap${localStorage.getItem('profileShowControls') === '1' ? ' show-controls' : ''}`;
  wrap.innerHTML = `<div class="sc-3d-scene"><div class="sc-3d-car" id="sc-3d-car">${cardsHtml}</div></div><div class="sc-3d-controls"><button class="sc-3d-btn sc-3d-btn-sq" id="sc-3d-prev">◀</button><button class="sc-3d-btn sc-3d-btn-sel" id="sc-3d-sel">ВЫБРАТЬ</button><button class="sc-3d-btn sc-3d-btn-sq" id="sc-3d-next">▶</button></div>`;

  const oldTabs = root.querySelector('.profile-tabs'), mountTarget = oldTabs || root.querySelector('.profile-wrap');
  if (!mountTarget) return;
  oldTabs ? oldTabs.replaceWith(wrap) : mountTarget.insertBefore(wrap, mountTarget.firstChild);

  let currIdx = 0, startX = 0, startY = 0, isDrag = false, dragDelta = 0;
  setTimeout(() => {
    const car = root.querySelector('#sc-3d-car'), scene = root.querySelector('.sc-3d-scene');
    if (!car || !scene) return;
    let _sDb = null;

    const doSelect = (inst = false) => {
      clearTimeout(_sDb);
      _sDb = setTimeout(() => {
        clearTimeout(wrap._tAuto);
        const tab = root.querySelector(`#tab-${cardsData[((currIdx % TOTAL) + TOTAL) % TOTAL].id}`);
        if (!tab || tab.classList.contains('active')) { if(tab) tab.style.cssText = ''; return; }
        const prev = root.querySelector('.profile-tab-content.active');
        const enter = () => { root.querySelectorAll('.profile-tab-content').forEach(x => { x.classList.remove('active'); x.style.cssText = ''; }); requestAnimationFrame(() => requestAnimationFrame(() => tab.classList.add('active'))); };
        if (prev && prev !== tab && !inst) { prev.style.transition = 'opacity .18s ease, transform .18s cubic-bezier(.22,1,.36,1)'; prev.style.opacity = '0'; prev.style.transform = 'translateY(26px) scale(.965)'; setTimeout(enter, 180); } else enter();
      }, 80);
    };

    const update = (anim = true, inst = false) => {
      car.style.transition = anim ? 'transform .75s cubic-bezier(.22,1,.36,1)' : 'none';
      car.style.transform = `rotateY(${currIdx * -STEP}deg)`;
      const norm = ((currIdx % TOTAL) + TOTAL) % TOTAL;
      car.querySelectorAll('.sc-3d-card').forEach((c, i) => { const diff = Math.min(Math.abs(i - norm), TOTAL - Math.abs(i - norm)); c.classList.toggle('is-active', diff === 0); c.classList.toggle('is-back', diff >= 2); });
      wrap.classList.remove('is-settled'); clearTimeout(wrap._tS);
      if (anim) wrap._tS = setTimeout(() => { wrap.classList.add('is-settled'); doSelect(inst); }, 500);
      else { wrap.classList.add('is-settled'); doSelect(inst); }
    };

    const setPhysics = (mode, dx = 0) => {
      const tab = root.querySelector('.profile-tab-content.active'); if (!tab) return;
      if (mode === 'drag') { const p = Math.min(1, Math.abs(dx) / 135); tab.style.cssText = `will-change:transform,opacity;transition:none;transform:translateY(${Math.round(p * 132)}px) scale(${(1 - p * 0.065).toFixed(3)});opacity:${Math.max(0.12, 1 - p * 0.72)}`; return; }
      if (mode === 'restore') { tab.style.cssText = 'will-change:transform,opacity;transition:transform .28s cubic-bezier(.16,1,.3,1), opacity .24s ease;transform:translateY(0) scale(1);opacity:1'; tab.addEventListener('transitionend', () => tab.style.cssText = '', { once: true }); return; }
      if (mode === 'commit') { tab.style.cssText = 'will-change:transform,opacity;transition:transform .2s cubic-bezier(.55,0,.85,.25), opacity .16s ease;transform:translateY(168px) scale(.92);opacity:0'; tab.addEventListener('transitionend', () => tab.style.cssText = '', { once: true }); }
    };

    root.querySelector('#sc-3d-prev')?.addEventListener('click', () => { currIdx--; update(true); });
    root.querySelector('#sc-3d-next')?.addEventListener('click', () => { currIdx++; update(true); });
    root.querySelector('#sc-3d-sel')?.addEventListener('click', () => doSelect(false));

    scene.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; isDrag = true; dragDelta = 0; car.style.transition = 'none'; wrap.classList.remove('is-settled'); clearTimeout(wrap._tS); clearTimeout(_sDb); }, { passive: true });
    scene.addEventListener('touchmove', e => { if (!isDrag) return; const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY; if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; if (Math.abs(dy) > Math.abs(dx) + 14) { isDrag = false; setPhysics('restore'); update(true, false); return; } dragDelta = dx; car.style.transform = `rotateY(${currIdx * -STEP + Math.max(-150, Math.min(150, dx)) * 0.52}deg)`; setPhysics('drag', dx); }, { passive: true });
    scene.addEventListener('touchend', e => { if (!isDrag) return; isDrag = false; if (Math.abs(dragDelta) > 40) { setPhysics('commit'); currIdx += dragDelta > 40 ? -1 : 1; dragDelta = 0; update(true, true); return; } if (Math.abs(dragDelta) < 10) { const c = e.target.closest('.sc-3d-card'); if (c && parseInt(c.dataset.idx, 10) === ((currIdx % TOTAL) + TOTAL) % TOTAL && wrap.classList.contains('is-settled')) doSelect(false); } dragDelta = 0; setPhysics('restore'); update(true, false); }, { passive: true });
    scene.addEventListener('wheel', e => { e.preventDefault(); currIdx += e.deltaY > 0 ? 1 : -1; update(true); }, { passive: false });
    car.addEventListener('click', e => { const c = e.target.closest('.sc-3d-card'); if (!c) return; const i = parseInt(c.dataset.idx, 10), n = ((currIdx % TOTAL) + TOTAL) % TOTAL; if (i !== n) { let diff = i - n; if (diff > TOTAL / 2) diff -= TOTAL; if (diff < -TOTAL / 2) diff += TOTAL; currIdx += diff; update(true); } else if (wrap.classList.contains('is-settled')) doSelect(false); });

    root.querySelectorAll('.profile-tab-content').forEach(x => { x.classList.remove('active'); x.style.animation = 'none'; });
    const initTab = root.querySelector(`#tab-${cardsData[0].id}`); if (initTab) { initTab.classList.add('active'); setTimeout(() => root.querySelectorAll('.profile-tab-content').forEach(x => x.style.animation = ''), 50); }
    update(false);

    W.Intel_CarouselFlat = {
      jumpTo: tIdx => { const n = ((currIdx % TOTAL) + TOTAL) % TOTAL; let diff = tIdx - n; if (diff > TOTAL / 2) diff -= TOTAL; if (diff < -TOTAL / 2) diff += TOTAL; currIdx += diff; update(true); },
      selectCurrent: () => doSelect(false)
    };
  }, 60);
}
export default { mountProfileCarouselFlat };
