import { shardWallet } from './wallet-service.js';

const esc = value =>
  window.Utils?.escapeHtml?.(String(value || '')) ||
  String(value || '');

const serverRewardMap = () =>
  new Map(
    (
      window.ListeningReceipts
        ?.getRewardCatalog?.() || []
    ).map(item => [
      String(item?.id || ''),
      item
    ])
  );

const nearestAchievements = () => {
  const rewards = serverRewardMap();

  return (window.achievementEngine?.achievements || [])
    .filter(item =>
      !item.isUnlocked &&
      !item.isHidden &&
      item.progress &&
      rewards.has(String(item.id || ''))
    )
    .map(item => ({
      ...item,
      shardReward: Number(
        rewards.get(String(item.id || ''))?.amount || 0
      )
    }))
    .sort((a, b) =>
      Number(b.progress?.pct || 0) -
      Number(a.progress?.pct || 0)
    )
    .slice(0, 3);
};

const renderAchievements = () => {
  const items = nearestAchievements();

  if (!items.length) {
    return `
      <div class="shards-empty">
        Ближайшие музыкальные достижения пока недоступны.
      </div>
    `;
  }

  return items.map(item => `
    <div class="shards-achievement">
      <span class="shards-achievement-icon">
        ${esc(item.icon)}
      </span>
      <div class="shards-achievement-info">
        <b>${esc(item.name)}</b>
        <small>${esc(item.short)}</small>
        <div class="shards-achievement-progress">
          <i style="width:${Math.max(
            0,
            Math.min(100, Number(item.progress?.pct || 0))
          )}%"></i>
        </div>
      </div>
      <strong>
        +${Number(item.shardReward || 0)} ♦
        <small>после проверки</small>
      </strong>
    </div>
  `).join('');
};

const openInsufficientModal = (item, wallet) => {
  window.Modals?.open?.({
    title: 'Недостаточно Осколков',
    maxWidth: 400,
    bodyHtml: `
      <div class="shards-modal-note">
        Для покупки «<b>${esc(item.title)}</b>» требуется
        <b>${Number(item.price || 0)} ♦</b>.<br><br>
        Доступно: <b>${Number(wallet.spendable || 0)} ♦</b>.
        Новые музыкальные награды появятся после
        серверного подтверждения достижения.
      </div>
      <div class="shards-achievements">
        ${renderAchievements()}
      </div>
    `
  });
};

export const loadShardsView = async ctx => {
  ctx.renderAlbumTitle('♦ ОСКОЛКИ ♦', 'shards');

  const cover = document.getElementById('cover-wrap');
  if (cover) cover.style.display = 'none';

  window.GalleryManager?.clear?.();

  const root = document.getElementById('track-list');
  if (!root) return;

  if (!shardWallet.isAuthorized()) {
    root.innerHTML = `
      <div class="shards-empty">
        <b>🔒 Осколки доступны после входа через Яндекс</b>
        <span>
          Авторизация нужна для серверного кошелька,
          покупок и будущих рейтинговых ставок.
        </span>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="shards-loading">
      Загружаем кошелёк...
    </div>
  `;

  const render = () => {
    const wallet = shardWallet.getSnapshot();
    const owned = new Set(wallet.purchasedAvatarIds || []);

    root.innerHTML = `
      <section class="shards-view">
        <div class="shards-wallet-card">
          <span class="shards-wallet-icon">♦</span>
          <div>
            <small>Кошелёк Осколков</small>
            <b>${Number(wallet.shards || 0)}</b>
            <span>
              Доступно: ${Number(wallet.spendable || 0)}
              · Заблокировано: ${Number(wallet.locked || 0)}
            </span>
          </div>
        </div>

        <div class="shards-note">
          За регистрацию через Яндекс начисляется
          <b>100 Осколков</b>.
          Размер каждой награды задаётся
          <b>серверным каталогом достижений</b>.
          Награда зачисляется после серверной проверки
          и не может быть повторно получена через restore
          или другое устройство.
        </div>

        <h2 class="shards-section-title">
          Магазин аватаров
        </h2>

        <div class="shards-shop">
          ${shardWallet.getCatalog().map(item => `
            <button
              class="shards-product ${owned.has(item.id) ? 'is-owned' : ''}"
              type="button"
              data-shard-item="${esc(item.id)}"
            >
              <span>${esc(item.avatar)}</span>
              <b>${esc(item.title)}</b>
              <small>
                ${owned.has(item.id)
                  ? 'Куплено'
                  : `${Number(item.price || 0)} ♦`}
              </small>
            </button>
          `).join('')}
        </div>

        <h2 class="shards-section-title">
          Ближайшие достижения
        </h2>

        <div class="shards-achievements">
          ${renderAchievements()}
        </div>
      </section>
    `;

    root.querySelectorAll('[data-shard-item]')
      .forEach(button => {
        button.addEventListener('click', async () => {
          const item = shardWallet.getCatalog().find(
            row => row.id === button.dataset.shardItem
          );

          if (!item || owned.has(item.id)) return;

          const current = shardWallet.getSnapshot();
          if (Number(current.spendable || 0) < Number(item.price || 0)) {
            openInsufficientModal(item, current);
            return;
          }

          button.disabled = true;

          try {
            await shardWallet.purchaseAvatar(item.id);
            window.NotificationSystem?.success?.(
              `${item.avatar} Аватар куплен`
            );
            render();
          } catch (error) {
            window.NotificationSystem?.error?.(
              `Покупка не выполнена: ${error?.message || 'ошибка'}`
            );
            button.disabled = false;
          }
        });
      });
  };

  try {
    await window.ListeningReceipts?.refreshStatus?.().catch(() => null);
    if (!shardWallet.getSnapshot().available) {
      await shardWallet.refresh({ force: true });
    }
    render();
  } catch (error) {
    root.innerHTML = `
      <div class="shards-empty">
        Не удалось загрузить кошелёк:
        ${esc(error?.message || 'wallet_unavailable')}
      </div>
    `;
  }
};

export default { loadShardsView };
