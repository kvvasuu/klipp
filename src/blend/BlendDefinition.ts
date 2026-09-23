import type { Ease } from './BlendCurves';

/** A fixed-duration curve or a damped transition. */
export type BlendDefinition = { curve: Ease; time: number } | { damping: number; maxSpeed?: number };

/** A blend override for an optional source and destination camera. */
export type CustomBlend = {
  from?: string;
  to?: string;
  blend: BlendDefinition;
};

/** Resolves the most specific custom blend for a transition. */
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
