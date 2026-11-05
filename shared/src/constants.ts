export const APP_NAME = 'Tack';

/** All dates are wall-clock times here, whatever zone the device is in (SPEC §1). */
export const TIME_ZONE = 'Africa/Algiers';

/** Bumped when the sync wire format changes. An older client holds its queue and reloads. */
export const PROTOCOL_VERSION = 1;

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const BOARD_COLORS = [
  'neutral',
  'slate',
  'blue',
  'teal',
  'green',
  'olive',
  'amber',
  'coral',
  'rose',
  'violet',
] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const DENSITIES = ['compact', 'roomy'] as const;
export type Density = (typeof DENSITIES)[number];

export const TRASH_DAYS = 30;
export const NOTIFICATION_KEEP_DAYS = 30;

/** Settings is a single synced row, always under this id. */
export const SETTINGS_ID = 'settings';
