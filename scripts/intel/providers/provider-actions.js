// UID.079_(VK social/media actions)_(подготовить нативные внешние действия)_(держать их в одном bridge слое, а не в UI хаосе) UID.080_(Provider actions bridge)_(не размазывать external actions по проекту)_(все likes/comments/community/video/audio hooks вести через этот модуль) UID.094_(No-paralysis rule)_(не ломать плеер при external action failure)_(любая ошибка action должна давать только мягкий false/null) UID.095_(Ownership boundary: legacy vs intel)_(provider-actions не должны становиться UI, auth или playback-слоем)_(модуль только маршрутизирует capability-based external actions без side effects на core ownership)
import { providerIdentity } from './provider-identity.js';
export const providerActions = {
  async init() { return true; },
  can(provider, capability) { return providerIdentity.hasCapability(provider, capability); },
  async run(provider, action, payload = {}) { const name = String(provider || '').trim(); if (!name) return { ok: false, reason: 'provider_missing' }; window.dispatchEvent(new CustomEvent('intel:provider-action', { detail: { provider: name, action, payload } })); return { ok: false, reason: 'not_implemented' }; }
};
export default providerActions;
