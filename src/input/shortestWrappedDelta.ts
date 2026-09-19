/** Shortest signed distance from `value` to `target` around `range`'s wraparound - e.g. going from 170°
 *  to -170° is a 20° step through the seam, not a 340° step the long way. */
export function shortestWrappedDelta(value: number, target: number, range: [number, number]): number {
  const span = range[1] - range[0];
  let delta = (target - value) % span;
  if (delta > span / 2) delta -= span;
  if (delta < -span / 2) delta += span;
  return delta;
}
