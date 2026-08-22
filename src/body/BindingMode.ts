/**
 * Which rotation (if any) `Follow` applies to `offset` before adding it to the target's world position.
 * `lockToTarget` (the default) applies the target's FULL live rotation, every frame — see `FollowBody`'s
 * doc comment for the other four.
 *
 * A "Lazy Follow" mode is deliberately NOT here — it's not a rotation-derivation variant of this same
 * algorithm, it's a structurally different one (distance-preserving, driven by the CAMERA's current
 * position, not a rotated offset).
 */
export const BindingModes = {
  worldSpace: 'worldSpace',
  lockToTarget: 'lockToTarget',
  lockToTargetWithWorldUp: 'lockToTargetWithWorldUp',
  lockToTargetNoRoll: 'lockToTargetNoRoll',
  lockToTargetOnAssign: 'lockToTargetOnAssign',
} as const;

export type BindingMode = (typeof BindingModes)[keyof typeof BindingModes];
