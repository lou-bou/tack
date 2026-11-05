// TEMPORARY: diagnoses the card panel freeze in the installed Android app. Off unless turned on
// from Settings. Delete this file and DiagnosticsSection.tsx once the cause is known.

const ENABLED_KEY = 'tack.trace.enabled';
const SWITCHES_KEY = 'tack.trace.switches';
const LOG_KEY = 'tack.trace.log';
const MAX_ENTRIES = 600;
const GAP_MS = 100;
const SLOW_EVENT_MS = 100;
const SAVE_EVERY_MS = 1000;

export const TRACE_SWITCHES = {
  noAnimation: "Panel doesn't slide in",
  noFocus: "Opening a card doesn't move focus",
  noEditor: 'Panel has no description editor',
  noSafeArea: 'Panel ignores screen-edge spacing',
} as const;
export type TraceSwitch = keyof typeof TRACE_SWITCHES;

type Entry = [time: number, type: string, detail: string];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The trace just won't survive a reload.
  }
}

function parse<T>(text: string | null, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

let log: Entry[] = [];
let active = false;
let switches = new Set<TraceSwitch>(parse<TraceSwitch[]>(read(SWITCHES_KEY), []));

function note(type: string, detail = ''): void {
  if (!active) return;
  log.push([Date.now(), type, detail]);
  if (log.length > MAX_ENTRIES) log = log.slice(-MAX_ENTRIES);
}

function applyStyles(): void {
  const id = 'tack-trace-styles';
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.append(style);
  }
  const panel = 'aside[aria-label="Card"]';
  style.textContent = [
    switches.has('noAnimation') ? `${panel} { animation: none !important; }` : '',
    switches.has('noSafeArea') ? `${panel} { padding: 0 !important; }` : '',
  ].join('\n');
}

/** Reads each switch when it's needed. All are off unless the diagnostics are on. */
export function traceSwitch(name: TraceSwitch): boolean {
  return active && switches.has(name);
}

export function traceSwitches(): ReadonlySet<TraceSwitch> {
  return switches;
}

export function setTraceSwitch(name: TraceSwitch, on: boolean): void {
  const next = new Set(switches);
  if (on) next.add(name);
  else next.delete(name);
  switches = next;
  write(SWITCHES_KEY, JSON.stringify([...next]));
  applyStyles();
  note('switch', `${name} ${on ? 'on' : 'off'}`);
}

function observe(type: string, handle: (entry: PerformanceEntry) => void, extra = {}): void {
  try {
    new PerformanceObserver((list) => list.getEntries().forEach(handle)).observe({
      type,
      ...extra,
    } as PerformanceObserverInit);
  } catch {
    note('unsupported', type);
  }
}

function record(): void {
  log = parse<Entry[]>(read(LOG_KEY), []);
  note(
    'start',
    `${navigator.userAgent} | standalone ${matchMedia('(display-mode: standalone)').matches} | ${innerWidth}x${innerHeight} @${devicePixelRatio}`,
  );

  // Frames the page itself got to draw. A gap means the page was blocked or wasn't being scheduled.
  let last = performance.now();
  const tick = (now: number) => {
    if (now - last > GAP_MS && document.visibilityState === 'visible') {
      note('frame gap', `${Math.round(now - last)}ms`);
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // The browser's own figure for how long an interaction took to reach the screen.
  observe(
    'event',
    (entry) => {
      const timing = entry as PerformanceEventTiming;
      if (timing.name !== 'click' && timing.duration < SLOW_EVENT_MS) return;
      const handlers = Math.round(timing.processingEnd - timing.processingStart);
      const wait = Math.round(timing.processingStart - timing.startTime);
      note(
        'to screen',
        `${timing.name} ${Math.round(timing.duration)}ms (waited ${wait}ms, handlers ${handlers}ms)`,
      );
    },
    { durationThreshold: 16 },
  );
  observe('long-animation-frame', (entry) => {
    if (entry.duration < GAP_MS) return;
    const { scripts = [] } = entry as PerformanceEntry & {
      scripts?: { sourceFunctionName?: string; invoker?: string; duration: number }[];
    };
    const top = [...scripts].sort((a, b) => b.duration - a.duration)[0];
    note(
      'slow frame',
      `${Math.round(entry.duration)}ms ${top ? `${top.invoker ?? ''} ${top.sourceFunctionName ?? ''}` : ''}`.trim(),
    );
  });

  addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      // Only names of controls. A checkbox's name holds the card's title, so it's left out.
      const label = target.closest('[role="checkbox"]')
        ? 'checkbox'
        : (target.closest('[aria-label]')?.getAttribute('aria-label')?.slice(0, 30) ??
          target.tagName);
      note('tap', label);
    },
    true,
  );
  addEventListener('focusin', (event) => note('focus', (event.target as Element).tagName), true);
  visualViewport?.addEventListener('resize', () => {
    note('viewport', `${visualViewport?.width}x${visualViewport?.height}`);
  });
  document.addEventListener('visibilitychange', () => {
    note('visibility', document.visibilityState);
    if (document.visibilityState === 'hidden') save();
  });

  new MutationObserver((records) => {
    for (const { addedNodes, removedNodes } of records) {
      addedNodes.forEach((node) => {
        if (!(node instanceof Element) || !node.matches('aside[aria-label="Card"]')) return;
        note('panel added');
        // Two frames on, the page has handed over a frame containing the panel.
        requestAnimationFrame(() => requestAnimationFrame(() => note('panel frame done')));
      });
      removedNodes.forEach((node) => {
        if (node instanceof Element && node.matches('aside[aria-label="Card"]')) {
          note('panel removed');
        }
      });
    }
  }).observe(document.body, { childList: true, subtree: true });

  setInterval(save, SAVE_EVERY_MS);
}

function save(): void {
  if (active) write(LOG_KEY, JSON.stringify(log));
}

export function traceEnabled(): boolean {
  return read(ENABLED_KEY) === '1';
}

/** Called at startup. Does nothing at all unless the diagnostics were turned on. */
export function startTrace(): void {
  if (!traceEnabled() || active) return;
  active = true;
  applyStyles();
  record();
}

export function enableTrace(): void {
  write(ENABLED_KEY, '1');
  startTrace();
}

/** Off again, and everything it stored is gone. Reloads to drop its listeners too. */
export function disableTrace(): void {
  active = false; // Or the save on the way out would write the log straight back.
  for (const key of [ENABLED_KEY, SWITCHES_KEY, LOG_KEY]) write(key, null);
  location.reload();
}

export function clearTrace(): void {
  log = [];
  save();
  note('cleared');
}

/** Times are relative to the start of the log, to keep it short and readable. */
export function traceReport(): string {
  const start = log[0]?.[0] ?? 0;
  return [
    `Tack diagnostics, switches on: ${[...switches].join(', ') || 'none'}`,
    ...log.map(([time, type, detail]) => `${time - start} ${type} ${detail}`.trim()),
  ].join('\n');
}
