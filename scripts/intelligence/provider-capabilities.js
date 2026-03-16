/* PROVIDER CAPABILITIES — future capability map for Yandex/Google/VK. */
// UID.122_provider_capabilities_model_(ввести provider capabilities/scopes/roles)_(для clean linked-provider logic)_(central capability descriptors live here)
// UID.123_yandex_backup_role_(зафиксировать роль Яндекса)_(для auth+backup+AI)_(capabilities for yandex)
// UID.124_google_mirror_role_(зафиксировать роль Google)_(для mirror backup/export)_(capabilities for google)
// UID.125_vk_social_role_(зафиксировать роль VK)_(для social/community/media)_(capabilities for vk)

export const PROVIDER_CAPABILITIES = Object.freeze({
  yandex: Object.freeze({
    auth: true,
    backup: true,
    restore: true,
    metrics: true,
    aiText: true,
    aiReasoning: true,
    social: false,
    media: false
  }),
  google: Object.freeze({
    auth: true,
    backup: true,
    restore: true,
    metrics: false,
    aiText: false,
    aiReasoning: false,
    social: false,
    media: false
  }),
  vk: Object.freeze({
    auth: true,
    backup: false,
    restore: false,
    metrics: false,
    aiText: false,
    aiReasoning: false,
    social: true,
    media: true
  })
});

export default PROVIDER_CAPABILITIES;
