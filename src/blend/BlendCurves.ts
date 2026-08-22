/** An easing function: raw linear progress `t` (0..1) in, eased progress out. */
export type Ease = (t: number) => number;

/**
 * Named blend curve styles. "Custom" isn't a fixed curve here — just pass your own `Ease` instead.
 *
 * The In/Out naming describes the TRANSITION (departure vs. arrival), not raw acceleration — e.g.
 * `easeIn` = full-rate departure, eased arrival. That's the OPPOSITE of CSS's "ease-in" (slow start).
 */
export const BlendCurves = {
  /** Zero-length blend — stays at the start until the very last instant, then snaps. */
  cut: ((t) => (t < 1 ? 0 : 1)) as Ease,
  /** Mechanical-looking, constant-rate blend. */
  linear: ((t) => t) as Ease,
  /** S-shaped curve, gentle and smooth. */
  easeInOut: ((t) => t * t * (3 - 2 * t)) as Ease,
  /** Full-rate departure, eased arrival. */
  easeIn: ((t) => t * (2 - t)) as Ease,
  /** Eased departure, full-rate arrival. */
  easeOut: ((t) => t * t) as Ease,
  /** Abrupt departure, gentle arrival. */
  hardOut: ((t) => 1 - (1 - t) ** 3) as Ease,
  /** Gentle departure, abrupt arrival. */
  hardIn: ((t) => t ** 3) as Ease,
} as const;
