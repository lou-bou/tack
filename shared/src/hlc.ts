/**
 * Hybrid logical clock. Values follow the time of the edit, always move forward on one device
 * even if its clock jumps back, and compare correctly as plain strings:
 * `<13-digit ms>:<4-digit counter>:<node>`.
 */
export type Hlc = string;

/** No real timestamp sorts below this, so it marks a field that has never been written. */
export const HLC_ZERO: Hlc = '0000000000000:0000:';

const pad = (value: number, width: number) => String(value).padStart(width, '0');

export function formatHlc(ms: number, counter: number, node: string): Hlc {
  return `${pad(ms, 13)}:${pad(counter, 4)}:${node}`;
}

export function hlcMs(hlc: Hlc): number {
  return Number(hlc.slice(0, 13));
}

export function hlcCounter(hlc: Hlc): number {
  return Number(hlc.slice(14, 18));
}

export class HlcClock {
  private ms = 0;
  private counter = 0;
  private offset = 0;

  constructor(
    private readonly node: string,
    private readonly wall: () => number = Date.now,
  ) {}

  /** Stamps a new edit. */
  now(): Hlc {
    const wall = this.wall() + this.offset;
    if (wall > this.ms) {
      this.ms = wall;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return formatHlc(this.ms, this.counter, this.node);
  }

  /** Moves past a clock seen from elsewhere, so the next edit here beats what this device saw. */
  observe(hlc: Hlc): void {
    const ms = hlcMs(hlc);
    const counter = hlcCounter(hlc);
    if (ms > this.ms || (ms === this.ms && counter > this.counter)) {
      this.ms = ms;
      this.counter = counter;
    }
  }

  /** Corrects for a wrong device clock, using the server's time from its latest response. */
  syncWall(serverMs: number): void {
    this.offset = serverMs - this.wall();
  }
}

const MAX_FUTURE_MS = 5 * 60_000;

/** Limits how far ahead a clock can be, so a phone with a wrong clock can't win every conflict. */
export function clampHlc(hlc: Hlc, serverNow: number): Hlc {
  const limit = serverNow + MAX_FUTURE_MS;
  if (hlcMs(hlc) <= limit) return hlc;
  const node = hlc.slice(19);
  return formatHlc(limit, hlcCounter(hlc), node);
}
