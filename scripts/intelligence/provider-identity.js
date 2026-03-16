/* PROVIDER IDENTITY — future one-user-many-providers identity model. */
// UID.119_yandex_auth_primary_(сделать Яндекс primary auth)_(для входа/backup/экосистемы)_(primaryProvider model here)
// UID.120_internal_user_profile_(ввести internal user profile)_(для одного канонического пользователя)_(internalUserId + linkedProviders)
// UID.121_linked_providers_model_(ввести linked providers)_(для расширения возможностей без конфликтов)_(link/unlink/primary role here)
// UID.122_provider_capabilities_model_(опираться на capability map)_(для явной логики провайдеров)_(provider metadata references)

const noopAsync = async () => null;

export const providerIdentity = {
  id: 'provider-identity',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async getCurrent() { return null; },
  async linkProvider() { return null; },
  async unlinkProvider() { return null; },
  async setPrimaryProvider() { return null; },
  async getLinkedProviders() { return []; },
  teardown: noopAsync
};

export default providerIdentity;
