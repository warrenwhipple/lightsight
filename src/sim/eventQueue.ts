import type { ScheduledEvent, ScheduledEventRecord } from "./types.js";

export class EventQueue {
  private records: ScheduledEventRecord[] = [];
  private nextSeq = 1;

  enqueue(event: ScheduledEvent): void {
    this.records.push({ event, seq: this.nextSeq });
    this.nextSeq += 1;
  }

  popNext(): ScheduledEvent | undefined {
    if (this.records.length === 0) {
      return undefined;
    }
    this.records.sort(compareRecords);
    const record = this.records.shift();
    return record?.event;
  }

  peekNext(): ScheduledEvent | undefined {
    this.records.sort(compareRecords);
    return this.records[0]?.event;
  }

  snapshot(limit = 8): ScheduledEvent[] {
    return [...this.records]
      .sort(compareRecords)
      .slice(0, limit)
      .map((record) => record.event);
  }

  get size(): number {
    return this.records.length;
  }
}

function compareRecords(a: ScheduledEventRecord, b: ScheduledEventRecord): number {
  return a.event.time - b.event.time || a.seq - b.seq;
}
