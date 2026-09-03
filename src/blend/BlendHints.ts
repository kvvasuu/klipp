/** Per-camera bitmask (`|` to combine), OR'd from both sides of a transition - set via
 *  `<VirtualCamera hints={...}>`. Only `sphericalPosition`/`cylindricalPosition` are honored so far. */
export const BlendHints = {
  none: 0,
  cylindricalPosition: 1 << 0,
  sphericalPosition: 1 << 1,
  screenSpaceAimWhenTargetsDiffer: 1 << 2,
  ignoreTarget: 1 << 3,
  freezeWhenBlendingOut: 1 << 4,
  inheritPosition: 1 << 5,
} as const;

export type BlendHints = number;

export function hasBlendHint(hints: BlendHints, flag: number): boolean {
  return (hints & flag) !== 0;
}
