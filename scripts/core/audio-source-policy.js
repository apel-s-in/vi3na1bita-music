// Audio transport preferences only; album JSON, artwork and lyrics use their own transport.
export const AUDIO_SOURCE_KEY = 'audio:sources:v1';
export const AUDIO_SOURCE_ORDER = Object.freeze(['archive', 'jsdelivr', 'github', 'cloudru', 'yandex']);
export const AUDIO_SOURCE_LABELS = Object.freeze({ archive: 'Архив', jsdelivr: 'CDN · jsDelivr', github: 'GitHub Pages', cloudru: 'Cloud.ru', yandex: 'Яндекс' });
const defaults = () => ({ version: 2, mode: 'auto', order: [...AUDIO_SOURCE_ORDER], enabled: [...AUDIO_SOURCE_ORDER], bypassCache: false });
export const normalizeAudioSourcePolicy = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults();
  const clean = input => [...new Set((Array.isArray(input) ? input : []).filter(id => AUDIO_SOURCE_ORDER.includes(id)))];
  const order = clean(value.order);
  const enabled = Array.isArray(value.enabled) ? clean(value.enabled) : [...AUDIO_SOURCE_ORDER];
  if (Number(value.version || 1) < 2) {
    if (!order.includes('cloudru')) order.splice(order.includes('yandex') ? order.indexOf('yandex') : order.length, 0, 'cloudru');
    if (!enabled.includes('cloudru')) enabled.push('cloudru');
  }
  return { version: 2, mode: value.mode === 'manual' ? 'manual' : 'auto', order: [...order, ...AUDIO_SOURCE_ORDER.filter(id => !order.includes(id))], enabled, bypassCache: value.bypassCache === true };
};
export const getAudioSourcePolicy = () => {
  try { return normalizeAudioSourcePolicy(JSON.parse(localStorage.getItem(AUDIO_SOURCE_KEY))); }
  catch { return defaults(); }
};
export const getAudioSourceOrder = () => {
  const policy = getAudioSourcePolicy();
  return policy.mode === 'auto' ? [...AUDIO_SOURCE_ORDER] : policy.order.filter(id => policy.enabled.includes(id));
};
export const shouldUseAudioCache = () => !getAudioSourcePolicy().bypassCache;
export const setAudioSourcePolicy = value => {
  const policy = normalizeAudioSourcePolicy({ version: 2, ...value });
  if (policy.mode === 'manual' && !policy.enabled.length) throw new Error('audio_source_required');
  // Do not report success if the browser refused to persist the preference.
  localStorage.setItem(AUDIO_SOURCE_KEY, JSON.stringify(policy));
  window.dispatchEvent(new CustomEvent('audioSources:changed', { detail: { policy } }));
  return policy;
};
// Classic-script download helpers share the same cache policy as the ESM resolver.
window.AudioSourcePolicy = { getAudioSourcePolicy, getAudioSourceOrder, shouldUseAudioCache };
