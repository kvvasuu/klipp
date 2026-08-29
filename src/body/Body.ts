import { Follow } from './Follow';
import { HardLockToTarget } from './HardLockToTarget';
import { PositionComposer } from './PositionComposer';

/** `Body` computes a `VirtualCamera`'s POSITION, nothing else (rotation is `Aim`'s job) — at most one per
 *  camera. Same components as the named exports, re-grouped for JSX discoverability; prefer the named
 *  export directly if tree-shaking matters more than the namespaced call site. */
export const Body = {
  HardLockToTarget,
  Follow,
  PositionComposer,
};
