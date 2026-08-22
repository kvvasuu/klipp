import { Follow } from './Follow';
import { HardLockToTarget } from './HardLockToTarget';
import { PositionComposer } from './PositionComposer';

/**
 * `Body` computes a `VirtualCamera`'s POSITION, nothing else (rotation is `Aim`'s job). Goes inside a
 * `<VirtualCamera>` — at most one Body per camera.
 *
 * Namespace convenience for JSX discoverability (`<Body.HardLockToTarget/>`) — same components as the
 * named exports, re-grouped, not reimplemented. Prefer the named export directly if tree-shaking matters
 * more than the namespaced call site.
 */
export const Body = {
  HardLockToTarget,
  Follow,
  PositionComposer,
};
