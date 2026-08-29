/** Which rotation (if any) `Follow` applies to `offset` before adding it to the target's world position. */
export const BindingModes = {
  worldSpace: 'worldSpace',
  lockToTarget: 'lockToTarget',
  lockToTargetWithWorldUp: 'lockToTargetWithWorldUp',
  lockToTargetNoRoll: 'lockToTargetNoRoll',
  lockToTargetOnAssign: 'lockToTargetOnAssign',
} as const;

export type BindingMode = (typeof BindingModes)[keyof typeof BindingModes];
