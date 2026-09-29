/** Bitmask controlling how a camera transition is blended. */
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
