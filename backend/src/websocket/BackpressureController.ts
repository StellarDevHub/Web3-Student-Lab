export interface QueuedEvent {
  event: string;
  payload: unknown;
  eventId: string;
}

export interface BackpressureStats {
  sent: number;
  queued: number;
  dropped: number;
  pending: number;
}

export interface BackpressureOptions {
  highWaterMark: number;
  maxQueueSize: number;
  bufferedAmount: () => number;
  send: (item: QueuedEvent) => void;
  onDrop?: (item: QueuedEvent, stats: BackpressureStats) => void;
}

export type EnqueueResult = 'sent' | 'queued' | 'dropped';

export class BackpressureController {
  private queue: QueuedEvent[] = [];
  private sentCount = 0;
  private queuedCount = 0;
  private droppedCount = 0;

  constructor(private readonly options: BackpressureOptions) {}

  enqueue(item: QueuedEvent): EnqueueResult {
    if (this.queue.length === 0 && this.bufferedAmount() < this.options.highWaterMark) {
      this.sentCount += 1;
      this.options.send(item);
      return 'sent';
    }

    if (this.queue.length >= this.options.maxQueueSize) {
      const dropped = this.queue.shift();
      this.droppedCount += 1;
      if (dropped) {
        this.options.onDrop?.(dropped, this.getStats());
      }
    }

    this.queue.push(item);
    this.queuedCount += 1;
    return 'queued';
  }

  drain(): number {
    let flushed = 0;
    while (
      this.queue.length > 0 &&
      this.bufferedAmount() < this.options.highWaterMark
    ) {
      const item = this.queue.shift()!;
      this.sentCount += 1;
      this.options.send(item);
      flushed += 1;
    }
    return flushed;
  }

  get pending(): number {
    return this.queue.length;
  }

  getStats(): BackpressureStats {
    return {
      sent: this.sentCount,
      queued: this.queuedCount,
      dropped: this.droppedCount,
      pending: this.queue.length,
    };
  }

  clear(): void {
    this.queue = [];
  }

  private bufferedAmount(): number {
    try {
      return this.options.bufferedAmount();
    } catch {
      return 0;
    }
  }
}
