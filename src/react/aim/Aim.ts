import { HardLookAt } from './HardLookAt.js';
import { PanTilt } from './PanTilt.js';
import { RotateWithFollowTarget } from './RotateWithFollowTarget.js';
import { RotationComposer } from './RotationComposer.js';

/** Aim components control a `VirtualCamera`'s rotation. Use at most one per camera. */
export const Aim = {
  HardLookAt,
  RotateWithFollowTarget,
  RotationComposer,
  PanTilt,
};
