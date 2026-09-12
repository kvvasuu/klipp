import type { ComponentType } from 'react';

export type ExampleEntry = {
  /** URL-safe segment, unique within its category - the route is `/:category/:slug`. */
  slug: string;
  title: string;
  Scene: ComponentType;
  /** Shown behind the scene-info button in `SceneRoute` - omitted entirely (button included) while a
   *  scene has no writeup yet. */
  description?: string;
  /** Required, not defaulted - forces flipping this the moment a real Scene replaces Placeholder.
   *  false hides the entry from the sidebar entirely. */
  ready: boolean;
};

export type ExampleCategory = {
  /** URL-safe segment, unique across the whole registry. */
  slug: string;
  title: string;
  examples: ExampleEntry[];
};
