/* SESSION CONTEXT — future current-session intelligence layer. */
// UID.068_session_profile_layer_(ввести session profile)_(для “что сейчас включить дальше”)_(track recent context here)
// UID.102_session_next_recommendations_(готовить next-track recommendations)_(для умного потока воспроизведения)_(session window owned here)
// UID.167_sleep_mode_layer_(подготовить sleep mode context)_(для ночных/тихих подсказок)_(session flags and mood intent)

const noopAsync = async () => null;

export const sessionContext = {
  id: 'session-context',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  capture() { return null; },
  getCurrent() { return null; },
  getRecentTrackWindow() { return []; },
  reset() {},
  teardown: noopAsync
};

export default sessionContext;
