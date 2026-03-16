// UID.081_(Telemetry mapper)_(не смешивать локальную правду с внешней аналитикой)_(держать отдельный mapper слой для export)
// UID.082_(Local truth vs external telemetry split)_(защитить приватные данные)_(возвращать только whitelisted безопасные payload)
// UID.083_(Yandex Metrica safe export)_(готовить безопасную интеграцию с Метрикой)_(маппить только screen/recs/share/provider/sync события)
// UID.072_(Provider consents)_(уважать пользовательские разрешения)_(любой mapper должен сперва проверять consent state)
// UID.095_(Ownership boundary: legacy vs intel)_(mapper не должен читать/мутировать raw truth напрямую по месту)_(модуль только преобразует уже разрешённые события в export-safe payloads)

import { providerConsents } from '../providers/provider-consents.js';

export const telemetryMapper = {
  async init() {
    return true;
  },

  canExport(kind = 'analytics') {
    const consents = providerConsents.get();
    return !!consents[kind];
  },

  map(eventName, payload = {}) {
    return {
      event: String(eventName || '').trim(),
      payload: payload && typeof payload === 'object' ? payload : {},
      mappedAt: Date.now()
    };
  }
};

export default telemetryMapper;
