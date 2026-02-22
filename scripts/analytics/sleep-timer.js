import { eventLogger } from './event-logger.js';

export class SleepTimer {
  constructor() {
    this.timerId = null;
    this.targetTime = null;
  }
  setTimer(minutes) {
    this.clear();
    this.targetTime = Date.now() + minutes * 60000;
    eventLogger.log('FEATURE_USED', { feature: 'sleep_timer' });
    this.timerId = setInterval(() => {
      if (Date.now() >= this.targetTime) {
        window.dispatchEvent(new CustomEvent('player:stop'));
        this.clear();
      }
    }, 1000);
  }
  clear() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    this.targetTime = null;
  }
}
export const sleepTimer = new SleepTimer();
