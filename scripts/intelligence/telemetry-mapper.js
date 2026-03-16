/* TELEMETRY MAPPER — future safe export mapper for Yandex Metrica and external analytics. */
// UID.138_telemetry_mapper_layer_(ввести telemetry mapper)_(для безопасной внешней аналитики)_(map local events to exportable telemetry)
// UID.139_metrica_product_analytics_(подготовить Metrica hooks)_(для продуктовой аналитики)_(screen/recs/provider/share/sync events)
// UID.140_consent_layer_(уважать consent)_(для корректного включения аналитики)_(mapper must be consent-gated)
// UID.141_local_truth_vs_external_(разделять local truth и external telemetry)_(для архитектурной чистоты)_(never export raw history directly)

const noopAsync = async () => null;

export const telemetryMapper = {
  id: 'telemetry-mapper',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  mapEvent() { return null; },
  shouldEmit() { return false; },
  async emitMapped() { return null; },
  teardown: noopAsync
};

export default telemetryMapper;
