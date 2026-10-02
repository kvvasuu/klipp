import { Follow } from './Follow.js';
import { HardLockToTarget } from './HardLockToTarget.js';
import { PositionComposer } from './PositionComposer.js';

/** Body components control a `<VirtualCamera>`'s position. Use at most one per camera. */
export const Body = {
  HardLockToTarget,
  Follow,
  PositionComposer,
};
