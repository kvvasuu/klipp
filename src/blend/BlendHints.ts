/** Per-camera bitmask (`|` to combine), OR'd from both sides of a transition - set via
 *  `<VirtualCamera hints={...}>`. Only `sphericalPosition`/`cylindricalPosition`/`ignoreTarget` are
 *  honored so far. No `freezeWhenBlendingOut`: `BlendDriver` already always blends from a frozen snapshot
 *  of the outgoing camera, never its live state - there's nothing an extra flag would change. */
export const BlendHints = {
  none: 0,
  cylindricalPosition: 1 << 0,
  sphericalPosition: 1 << 1,
  screenSpaceAimWhenTargetsDiffer: 1 << 2,
  ignoreTarget: 1 << 3,
  inheritPosition: 1 << 4,
} as const;

export type BlendHints = number;

export function hasBlendHint(hints: BlendHints, flag: number): boolean {
  return (hints & flag) !== 0;
}
