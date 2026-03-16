/* TRACK PRESENTATION — future UI-ready card layer and manual override anchor. */
// UID.049_track_presentation_layer_(вынести presentation отдельно)_(для редактируемых карточек)_(card-ready fields live here)
// UID.050_track_presentation_overrides_(держать ручные overrides отдельно)_(для правки любой карточки)_(merge manual + generated fields)
// UID.158_editable_any_track_card_(обеспечить редактируемость любого UID)_(для редакторского контроля)_(per-UID presentation override strategy)

const noopAsync = async () => null;

export const trackPresentation = {
  id: 'track-presentation',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async getCard() { return null; },
  async getOverride() { return null; },
  async applyOverride() { return null; },
  async getSharePayload() { return null; },
  teardown: noopAsync
};

export default trackPresentation;
