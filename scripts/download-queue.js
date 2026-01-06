//=================================================
// FILE: scripts/download-queue.js
// Единая очередь (1 активная аудио-загрузка, приоритеты P0–P5 по ТЗ)
class DownloadQueue {
  constructor() {
    this.queue = []; // { uid, variant, priority, task(), resolve, reject }
    this.active = null;
    this.paused = false;
  }

  enqueue(taskObj) {
    this.queue.push(taskObj);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.process();
  }

  pause() { this.paused = true; if (this.active) this.active.abort(); }
  resume() { this.paused = false; this.process(); }

  process() {
    if (this.paused || this.active || !this.queue.length) return;

    const task = this.queue.shift();
    this.active = task;

    task.task()
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => {
        this.active = null;
        this.process();
      });
  }
}

window.downloadQueue = new DownloadQueue();
