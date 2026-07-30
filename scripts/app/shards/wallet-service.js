import { requestSocialAction } from '../../core/social-session.js';

const emptyWallet = () => ({
  available: false,
  version: 0,
  shards: 0,
  locked: 0,
  spendable: 0,
  earned: 0,
  spent: 0,
  purchasedAvatarIds: [],
  purchasedAvatars: [],
  updatedAt: 0
});

class ShardWalletService {
  constructor() {
    this.wallet = emptyWallet();
    this.catalog = [];
    this.loading = null;
  }

  isAuthorized() {
    return (
      window.YandexAuth?.getSessionStatus?.() === 'active' &&
      window.YandexAuth?.isTokenAlive?.()
    );
  }

  getSnapshot() {
    return {
      ...this.wallet,
      purchasedAvatarIds: [
        ...(this.wallet.purchasedAvatarIds || [])
      ],
      purchasedAvatars: [
        ...(this.wallet.purchasedAvatars || [])
      ]
    };
  }

  getCatalog() {
    return this.catalog.map(item => ({ ...item }));
  }

  emit(reason = 'refresh') {
    window.dispatchEvent(new CustomEvent(
      'shards:wallet-updated',
      {
        detail: {
          reason,
          wallet: this.getSnapshot(),
          catalog: this.getCatalog()
        }
      }
    ));
  }

  ingest(wallet, { catalog = null, reason = 'server_result' } = {}) {
    if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)) return this.getSnapshot();
    this.wallet = { ...emptyWallet(), ...wallet, available: wallet.available === true };
    if (Array.isArray(catalog)) this.catalog = catalog.map(item => ({ ...item }));
    this.emit(reason);
    return this.getSnapshot();
  }

  reset(reason = 'logout') {
    this.wallet = emptyWallet();
    this.catalog = [];
    this.emit(reason);
  }

  async refresh({ force = false } = {}) {
    if (!this.isAuthorized()) {
      this.reset('unauthorized');
      return this.getSnapshot();
    }

    if (this.loading) return this.loading;

    this.loading = requestSocialAction('wallet_get', {})
      .then(result => this.ingest(result?.wallet, {
        catalog: result?.catalog,
        reason: 'refresh'
      }))
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }

  async purchaseAvatar(itemId) {
    if (!this.isAuthorized()) {
      throw new Error('wallet_auth_required');
    }

    const result = await requestSocialAction(
      'wallet_purchase_avatar',
      {
        itemId: String(itemId || '').trim(),
        purchaseId: `purchase_${crypto.randomUUID()}`
      }
    );

    if (result?.wallet) {
      this.wallet = {
        ...emptyWallet(),
        ...result.wallet,
        available: true
      };
    }

    this.emit('purchase');
    return result;
  }
}

export const shardWallet = new ShardWalletService();
window.ShardWallet = shardWallet;

window.addEventListener('yandex:auth:changed', event => {
  if (event.detail?.status === 'active') {
    shardWallet.refresh({ force: true }).catch(() => null);
  } else {
    shardWallet.reset('logout');
  }
});

export default shardWallet;
