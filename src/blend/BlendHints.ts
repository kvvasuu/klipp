/**
 * Per-camera flags affecting HOW a blend interpolates. Bitmask, combine with `|`.
 *
 * `cylindricalPosition`/`sphericalPosition`/`screenSpaceAimWhenTargetsDiffer` need a target position,
 * which `CameraState` doesn't carry yet — `lerpCameraState` accepts these flags but doesn't act on them
 * yet. `freezeWhenBlendingOut`/`inheritPosition` decide what "from"/"to" even ARE before lerp runs, so
 * they're `KlippCore`'s concern, not `lerpCameraState`'s.
 *
 * Future basis for `sphericalPosition`/`cylindricalPosition`: camera-controls' `lerp()` interpolates in
 * spherical coordinates relative to each state's own target instead of cartesian space, so the camera
 * arcs around the target instead of flying through it.
 */
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
