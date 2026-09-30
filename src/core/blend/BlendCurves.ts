import { smoothstep } from 'math';
import { easing } from 'math/time';

/** Maps linear progress `t` in `[0, 1]` to eased progress. */
export type Ease = (t: number) => number;

/** Named blend curves. Pass a custom `Ease` for other shapes. */
export const BlendCurves = {
  /** Snaps at the end of the blend. */
  cut: ((t) => (t < 1 ? 0 : 1)) as Ease,
  /** Constant-rate blend. */
  linear: easing.linear as Ease,
  /** Smooth S-shaped blend. */
  easeInOut: ((t) => smoothstep(0, 1, t)) as Ease,
  /** Fast departure, eased arrival. */
  easeIn: ((t) => t * (2 - t)) as Ease,
  /** Eased departure, fast arrival. */
  easeOut: ((t) => t * t) as Ease,
  /** Abrupt departure, smooth arrival. */
  hardOut: easing.cubicOut as Ease,
  /** Smooth departure, abrupt arrival. */
  hardIn: easing.cubicIn as Ease,
} as const;
