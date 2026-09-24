import type { ComponentType } from 'react';

export type ExampleEntry = {
  /** URL-safe segment, unique within its category - the route is `/:category/:slug`. */
  slug: string;
  title: string;
  Scene: ComponentType;
  /** Shown behind the scene-info button. Omit to hide the button. */
  description?: string;
  /** Starting pose for the spectator inset. Omit to use `BaseScene`'s default. */
  spectatorPosition?: [number, number, number];
  spectatorTarget?: [number, number, number];
  /** `false` hides the entry from the sidebar. */
  ready: boolean;
  /** Consecutive entries with the same `group` render as one sub-list in the sidebar. */
  group?: string;
};

export type ExampleCategory = {
  /** URL-safe segment, unique across the whole registry. */
  slug: string;
  title: string;
  examples: ExampleEntry[];
};
