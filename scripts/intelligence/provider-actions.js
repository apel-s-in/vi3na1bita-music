/* PROVIDER ACTIONS — future capability-gated bridge for Yandex/Google/VK actions. */
// UID.126_provider_action_bridge_(ввести provider action bridge)_(для безопасных внешних действий)_(single action router here)
// UID.161_vk_community_open_(подготовить open community action)_(для связи с сообществом)_(VK capability-gated actions)
// UID.162_vk_comments_likes_video_(подготовить comments/likes/video actions)_(для social UX)_(future VK actions)
// UID.163_vk_music_api_future_(зарезервировать future music API actions)_(для прямых медиа-фич)_(vk media capability placeholder)

const noopAsync = async () => null;

export const providerActions = {
  id: 'provider-actions',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async listAvailable() { return []; },
  async run() { return null; },
  async openCommunity() { return null; },
  async openVideo() { return null; },
  async sendMessage() { return null; },
  teardown: noopAsync
};

export default providerActions;
