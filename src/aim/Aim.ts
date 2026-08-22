import { HardLookAt } from './HardLookAt';
import { RotateWithFollowTarget } from './RotateWithFollowTarget';
import { RotationComposer } from './RotationComposer';

/**
 * `Aim` computes a `VirtualCamera`'s ROTATION, nothing else (position is `Body`'s job). Goes inside a
 * `<VirtualCamera>` — at most one Aim per camera.
 *
 * Namespace convenience for JSX discoverability (`<Aim.HardLookAt/>`) — same components as the named
 * exports, re-grouped, not reimplemented. Prefer the named export directly if tree-shaking matters more
 * than the namespaced call site.
 */
export const Aim = {
  HardLookAt,
  RotateWithFollowTarget,
  RotationComposer,
};
