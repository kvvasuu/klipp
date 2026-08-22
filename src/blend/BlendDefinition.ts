import type { Ease } from './BlendCurves';

/** A blend's curve + duration. */
export type BlendDefinition = {
  curve: Ease;
  time: number;
};

/**
 * One entry of a Custom Blends list — an explicit From→To blend override. `from`/`to` omitted = matches
 * any camera on that side (`undefined` instead of a magic wildcard string — cleaner in TS, and avoids a
 * reserved value colliding with a real camera id).
 */
export type CustomBlend = {
  from?: string;
  to?: string;
  blend: BlendDefinition;
};

/**
 * Picks the best-matching custom blend for a from→to transition, falling back to `defaultBlend`.
 * Specificity: exact (from AND to) match wins, then a to-only wildcard, then a from-only wildcard, then
 * `defaultBlend`. "To this camera" is more specific than "from this camera" — that's the more common
 * thing to want pinned down (e.g. "cutting to the close-up is always fast").
 */
export function resolveBlendDefinition(
  customBlends: CustomBlend[],
  from: string | null,
  to: string,
  defaultBlend: BlendDefinition,
): BlendDefinition {
  let best: CustomBlend | null = null;
  let bestSpecificity = -1;

  for (const entry of customBlends) {
    if (entry.to !== undefined && entry.to !== to) continue;
    if (entry.from !== undefined && entry.from !== from) continue;

    const specificity = (entry.to !== undefined ? 2 : 0) + (entry.from !== undefined ? 1 : 0);
    if (specificity > bestSpecificity) {
      best = entry;
      bestSpecificity = specificity;
    }
  }

  return best ? best.blend : defaultBlend;
}
