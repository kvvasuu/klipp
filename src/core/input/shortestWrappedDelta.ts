/** Shortest signed distance from `value` to `target` within a wrapped range. */
export function shortestWrappedDelta(value: number, target: number, range: [number, number]): number {
  const span = range[1] - range[0];
  let delta = (target - value) % span;
  if (delta > span / 2) delta -= span;
  if (delta < -span / 2) delta += span;
  return delta;
}
