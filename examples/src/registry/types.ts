import type { ComponentType } from 'react';

export type ExampleEntry = {
  /** URL-safe segment, unique within its category - the route is `/:category/:slug`. */
  slug: string;
  title: string;
  Scene: ComponentType;
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
