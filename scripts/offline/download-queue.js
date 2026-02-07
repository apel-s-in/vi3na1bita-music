/**
 * download-queue.js — v2.0 Audit Fix
 * Fix #12.1: NetPolicy check before each download
 * Fix #12.2: Subscribe to netPolicy:changed
 * Fix #12.3: Priority-based sorting (P0-P5)
 */

export class DownloadQueue {
  constructor({ parallel = 2, onProgress, onComplete, onError } = {}) {
    this._queue = [];
    this._networkWaiting = [];
    this._active = new Map();
    this._parallel = parallel;
    this._processing = false;
    this._paused = false;
    this._onProgress = onProgress || (() => {});
    this._onComplete = onComplete || (() => {});
    this._onError = onError || (() => {});

    // Fix #12.2: Resume waiting tasks when network policy changes
    window.addEventListener('netPolicy:changed', () => {
      if (this._networkAllowed()) {
        if (this._networkWaiting.length > 0) {
          this._queue.push(...this._networkWaiting);
          this._networkWaiting = [];
          this._sortQueue();
          this._process();
        }
      }
    });

    // Also resume on online event
    window.addEventListener('online', () => {
      if (this._networkWaiting.length > 0 && this._networkAllowed()) {
        this._queue.push(...this._networkWaiting);
        this._networkWaiting = [];
        this._sortQueue();
        this._process();
      }
    });
  }

  // Fix #12.1: Centralized network check
  _networkAllowed() {
    if (window.NetPolicy) return window.NetPolicy.isNetworkAllowed();
    return navigator.onLine;
  }

  // Fix #12.3: Sort by priority DESC
  _sortQueue() {
    this._queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  enqueue(task) {
    if (!task || !task.uid || !task.url) return;
    const uid = String(task.uid).trim();

    // Skip if already active
    if (this._active.has(uid)) return;

    // Deduplicate in queue
    const existIdx = this._queue.findIndex(t => t.uid === uid);
    if (existIdx >= 0) {
      if ((task.priority || 0) > (this._queue[existIdx].priority || 0)) {
        this._queue[existIdx].priority = task.priority;
        this._sortQueue();
      }
      return;
    }

    // Deduplicate in waiting list
    const waitIdx = this._networkWaiting.findIndex(t => t.uid === uid);
    if (waitIdx >= 0) {
      if ((task.priority || 0) > (this._networkWaiting[waitIdx].priority || 0)) {
        this._networkWaiting[waitIdx].priority = task.priority;
      }
      return;
    }

    this._queue.push({ ...task, uid });
    this._sortQueue();
    this._process();
  }

  async _process() {
    if (this._processing) return;
    this._processing = true;

    try {
      while (this._queue.length > 0 && !this._paused) {
        // Fix #12.1: Check NetPolicy before each download
        if (!this._networkAllowed()) {
          // Move all remaining to waiting (don't drop)
          this._networkWaiting.push(...this._queue.splice(0));
          break;
        }

        // Respect parallel limit
        if (this._active.size >= this._parallel) break;

        const task = this._queue.shift();
        if (!task) break;

        this._active.set(task.uid, task);
        this._downloadOne(task); // fire-and-forget, managed by _active
      }
    } finally {
      this._processing = false;
    }

    // Emit queue status
    this._emitStatus();
  }

  async _downloadOne(task) {
    try {
      const controller = new AbortController();
      task._abort = controller;

      const resp = await fetch(task.url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const total = parseInt(resp.headers.get('content-length') || '0', 10);
      const reader = resp.body?.getReader();

      if (!reader) {
        // Fallback: blob download
        const blob = await resp.blob();
        this._onComplete(task, blob);
        this._emitDownloadEvent('download:complete', task, 100);
        return;
      }

      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;

        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        this._onProgress(task, { loaded, total, percent });
        this._emitDownloadEvent('download:progress', task, percent);
      }

      const blob = new Blob(chunks);
      this._onComplete(task, blob);
      this._emitDownloadEvent('download:complete', task, 100);

    } catch (e) {
      if (e.name === 'AbortError') return;
      this._onError(task, e);

      // If network error, move to waiting
      if (!this._networkAllowed()) {
        this._networkWaiting.push(task);
      }
    } finally {
      this._active.delete(task.uid);
      // Kick next
      setTimeout(() => this._process(), 0);
    }
  }

  _emitDownloadEvent(name, task, percent) {
    window.dispatchEvent(new CustomEvent(name, {
      detail: {
        uid: task.uid,
        percent,
        queueTotal: this._queue.length + this._active.size + this._networkWaiting.length,
        queueDone: 0 // caller can track externally
      }
    }));

    if (this._queue.length === 0 && this._active.size === 0) {
      window.dispatchEvent(new CustomEvent('download:queueEmpty'));
    }
  }

  _emitStatus() {
    window.dispatchEvent(new CustomEvent('download:statusChanged', {
      detail: this.getStats()
    }));
  }

  // Public API

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
    this._process();
  }

  cancel(uid) {
    const active = this._active.get(uid);
    if (active?._abort) active._abort.abort();
    this._active.delete(uid);
    this._queue = this._queue.filter(t => t.uid !== uid);
    this._networkWaiting = this._networkWaiting.filter(t => t.uid !== uid);
  }

  cancelAll() {
    for (const [uid, task] of this._active) {
      if (task._abort) task._abort.abort();
    }
    this._active.clear();
    this._queue = [];
    this._networkWaiting = [];
  }

  setParallel(n) {
    this._parallel = Math.max(1, n);
    this._process();
  }

  getStats() {
    return {
      active: this._active.size,
      queued: this._queue.length,
      waiting: this._networkWaiting.length,
      paused: this._paused
    };
  }

  // Alias for offline-manager
  getDownloadStatus() {
    return this.getStats();
  }
}

export default DownloadQueue;
