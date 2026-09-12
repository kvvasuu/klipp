import { categories } from './examples';
import type { ExampleCategory, ExampleEntry } from './types';

export type { ExampleCategory, ExampleEntry };
export { categories };

export function findExample(categorySlug: string | undefined, exampleSlug: string | undefined): ExampleEntry | null {
  const category = categories.find((c) => c.slug === categorySlug);
  return category?.examples.find((e) => e.slug === exampleSlug) ?? null;
}
