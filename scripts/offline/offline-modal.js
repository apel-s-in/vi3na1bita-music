// scripts/offline/offline-modal.js

import { getSetting, setSetting } from './cache-db.js';

export class OfflineModal {
  constructor({ utils, offlineManager, updater, getBreakdown }) {
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

    const toMB = (v) => Math.round((Number(v||0) / (1024*1024)));

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
          <label>N (порог): <input id="cloudN" type="number" min="1" value="${Number(threshold)||5}"/></label>
          <label>D (дней): <input id="cloudD" type="number" min="1" value="${Number(ttlDays)||31}"/></label>
        </section>

        <section>
          <h3>Сеть</h3>
          <label><input type="checkbox" id="net-wifi" ${wifi?'checked':''}/> Разрешить Wi‑Fi</label>
          <label><input type="checkbox" id="net-mobile" ${mobile?'checked':''}/> Разрешить мобильную</label>
        </section>

        <section>
          <h3>Кэш</h3>
          <div>pinned: ${toMB(breakdown.pinned)} MB</div>
          <div>cloud: ${toMB(breakdown.cloud)} MB</div>
          <div>transient: ${toMB(breakdown.transient)} MB</div>
          <div>other: ${toMB(breakdown.other)} MB</div>
          <button id="btn-clear">Очистить…</button>
        </section>

        <section>
          <h3>Обновления</h3>
          <button id="btn-update-all">Обновить все файлы</button>
        </section>

        <section>
          <h3>100% OFFLINE</h3>
          <button id="btn-100">Начать…</button>
        </section>
      </div>
    `;
    this._el = this._utils.createModal(html, { closeOnOverlay: true });
    this._bind();
  }

  _bind() {
    const $ = (sel) => this._el.querySelector(sel);

    $('#om-offline')?.addEventListener('change', async (e) => {
      await this._om.setOfflineMode(e.target.checked ? 'on' : 'off');
    });

    this._el.querySelectorAll('input[name="cq"]').forEach(r => {
      r.addEventListener('change', async (e) => {
        await this._om.setCacheQuality(e.target.value);
      });
    });

    $('#cloudN')?.addEventListener('change', async (e) => {
      await this._om.setCloudSettings({ threshold: Number(e.target.value), ttlDays: Number($('#cloudD')?.value || 31) });
    });

    $('#cloudD')?.addEventListener('change', async (e) => {
      await this._om.setCloudSettings({ threshold: Number($('#cloudN')?.value || 5), ttlDays: Number(e.target.value) });
    });

    $('#net-wifi')?.addEventListener('change', async (e) => {
      await this._om.setNetworkPolicy({ wifi: e.target.checked, mobile: !!$('#net-mobile')?.checked });
    });

    $('#net-mobile')?.addEventListener('change', async (e) => {
      await this._om.setNetworkPolicy({ wifi: !!$('#net-wifi')?.checked, mobile: e.target.checked });
    });

    $('#btn-update-all')?.addEventListener('click', () => {
      window.NotificationSystem?.info('Будут обновлены офлайн-файлы. Рекомендуется Wi‑Fi.');
    });

    $('#btn-clear')?.addEventListener('click', () => {
      window.NotificationSystem?.info('Очистка кэша доступна будет в следующем блоке.');
    });

    $('#btn-100')?.addEventListener('click', () => {
      window.NotificationSystem?.info('Режим 100% OFFLINE будет добавлен в финальном блоке.');
    });
  }
}
