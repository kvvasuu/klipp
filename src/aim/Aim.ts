import { HardLookAt } from './HardLookAt';
import { RotateWithFollowTarget } from './RotateWithFollowTarget';
import { RotationComposer } from './RotationComposer';

/** `Aim` computes a `VirtualCamera`'s ROTATION, nothing else (position is `Body`'s job) — at most one per
 *  camera. Same components as the named exports, re-grouped for JSX discoverability; prefer the named
 *  export directly if tree-shaking matters more than the namespaced call site. */
export const Aim = {
  HardLookAt,
  RotateWithFollowTarget,
  RotationComposer,
};
