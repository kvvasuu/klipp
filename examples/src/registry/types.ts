import type { ComponentType } from 'react';

export type ExampleEntry = {
  /** URL-safe segment, unique within its category - the route is `/:category/:slug`. */
  slug: string;
  title: string;
  Scene: ComponentType;
  /** Shown behind the scene-info button in `SceneRoute` - omitted entirely (button included) while a
   *  scene has no writeup yet. */
  description?: string;
  /** Starting pose for `BaseScene`'s spectator inset - each scene's subject sits somewhere different, so
   *  the one-size-fits-all default rarely frames it well. Omit either to keep `BaseScene`'s default. */
  spectatorPosition?: [number, number, number];
  spectatorTarget?: [number, number, number];
  /** Required, not defaulted - forces flipping this the moment a real Scene replaces Placeholder.
   *  false hides the entry from the sidebar entirely. */
  ready: boolean;
  /** Consecutive entries sharing this value render as one visually connected sub-list in the sidebar,
   *  instead of separate top-level items - for one component split across several focused scenes. */
  group?: string;
};

export type ExampleCategory = {
  /** URL-safe segment, unique across the whole registry. */
  slug: string;
  title: string;
  examples: ExampleEntry[];
};
