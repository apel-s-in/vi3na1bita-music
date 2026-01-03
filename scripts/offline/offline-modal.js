// scripts/offline/offline-modal.js

import { getSetting, setSetting } from './cache-db.js';

export class OfflineModal {
  constructor({ utils, offlineManager, updater, getBreakdown }) {
    // utils: { createModal(html, options) }
    this._utils = utils;
    this._om = offlineManager;
    this._updater = updater;
    this._getBreakdown = getBreakdown || (async () => ({ pinned:0, cloud:0, transient:0, other:0 }));
    this._el = null;
  }

  async open() {
    const cq = await getSetting('cacheQuality:v1', 'hi');
    const offlineMode = await getSetting('offlinePolicy:v1', 'off');
    const wifi = await getSetting('net:wifi:v1', true);
    const mobile = await getSetting('net:mobile:v1', true);
    const threshold = await getSetting('cloud:threshold', 5);
    const ttlDays = await getSetting('cloud:ttlDays', 31);
    const breakdown = await this._getBreakdown();

    const html = `
      <div class="offline-modal">
        <h2>OFFLINE</h2>
        <section>
          <h3>Offline mode</h3>
          <label><input type="checkbox" id="om-offline" ${offlineMode==='on'?'checked':''}/> Включить политику OFFLINE</label>
        </section>
        <section>
          <h3>Cache quality</h3>
          <label><input type="radio" name="cq" value="hi" ${cq==='hi'?'checked':''}/> Hi</label>
          <label><input type="radio" name="cq" value="lo" ${cq==='lo'?'checked':''}/> Lo</label>
        </section>
        <section>
          <h3>Cloud</h3>
          <label>N (порог): <input id="cloudN" type="number" min="1" value="${threshold}"/></label>
          <label>D (дней): <input id="cloudD" type="number" min="1" value="${ttlDays}"/></label>
        </section>
        <section>
          <h3>Сеть</h3>
          <label><input type="checkbox" id="net-wifi" ${wifi?'checked':''}/> Разрешить Wi‑Fi</label>
          <label><input type="checkbox" id="net-mobile" ${mobile?'checked':''}/> Разрешить мобильную</label>
        </section>
        <section>
          <h3>Кэш</h3>
          <
