/* TRACK PROFILE MODAL — future UI passport for a single track. */
// UID.051_track_profile_modal_ui_(ввести modal паспорта трека)_(для deep card UX)_(summary+themes+quotes+relations+badges here)
// UID.049_track_presentation_layer_(опираться на presentation layer)_(для редактируемых карточек)_(modal uses card-ready fields)
// UID.027_track_profiles_full_(грузить full profile on demand)_(для deep modal)_(loader integration planned here)

const noopAsync = async () => null;

export const trackProfileModal = {
  id: 'track-profile-modal',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; window.TrackProfileModal = this; return this; },
  async open() { return null; },
  close() { return null; },
  teardown: noopAsync
};

export default trackProfileModal;
