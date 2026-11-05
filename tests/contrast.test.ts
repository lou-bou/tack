import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_COLORS } from '@tack/shared';

// Reads the real token file, so a changed colour can't slip past this.
const css = fs.readFileSync(new URL('../web/src/themes/tokens.css', import.meta.url), 'utf8');

function tokens(theme: 'light' | 'dark'): Record<string, string> {
  const block = new RegExp(`:root\\[data-theme='${theme}'\\] \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1];
  if (!block) throw new Error(`No ${theme} block`);
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6});/g)].map((m) => [m[1]!, m[2]!]),
  );
}

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A 12% tint of a colour over a background, as the date chips use. */
const tint = (color: Rgb, over: Rgb, amount = 0.12): Rgb =>
  color.map((c, i) => c * amount + over[i]! * (1 - amount)) as Rgb;

describe.each(['light', 'dark'] as const)('%s theme contrast', (theme) => {
  const t = tokens(theme);
  const c = (name: string) => {
    const value = t[name];
    if (!value) throw new Error(`Missing --${name}`);
    return rgb(value);
  };
  const AA = 4.5;
  const NON_TEXT = 3;

  const surfaces = ['bg', 'surface', 'card', 'floating'];
  const boards = BOARD_COLORS.map((color) => `board-${color}`);

  it.each([...surfaces, ...boards])('body text on --%s', (surface) => {
    expect(contrast(c('ink'), c(surface))).toBeGreaterThanOrEqual(AA);
  });

  it.each([...surfaces, ...boards])('secondary text on --%s', (surface) => {
    expect(contrast(c('ink-2'), c(surface))).toBeGreaterThanOrEqual(AA);
  });

  it('muted text on cards, the one place it is allowed', () => {
    expect(contrast(c('ink-3'), c('card'))).toBeGreaterThanOrEqual(AA);
  });

  it('selected text on the soft accent', () => {
    expect(contrast(c('ink'), c('accent-soft'))).toBeGreaterThanOrEqual(AA);
  });

  it('text on the primary button', () => {
    expect(contrast(c('on-accent'), c('accent'))).toBeGreaterThanOrEqual(AA);
  });

  it('the badge', () => {
    expect(contrast(c('bg'), c('ink'))).toBeGreaterThanOrEqual(AA);
  });

  it.each(['danger', 'warning'])('--%s text on its own tint on a card', (name) => {
    expect(contrast(c(name), tint(c(name), c('card')))).toBeGreaterThanOrEqual(AA);
  });

  it.each(['danger'])('--%s on surfaces it appears on', (name) => {
    for (const surface of surfaces) {
      expect(contrast(c(name), c(surface))).toBeGreaterThanOrEqual(AA);
    }
  });

  it('the active tab, on the bar it sits on', () => {
    expect(contrast(c('accent'), c('card'))).toBeGreaterThanOrEqual(AA);
  });

  it.each(['priority-urgent', 'priority-high', 'priority-medium', 'priority-low'])(
    '--%s icons on a card',
    (name) => {
      expect(contrast(c(name), c('card'))).toBeGreaterThanOrEqual(NON_TEXT);
    },
  );

  it('the focus ring against every surface', () => {
    for (const surface of [...surfaces, ...boards]) {
      expect(contrast(c('accent'), c(surface))).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });
});
