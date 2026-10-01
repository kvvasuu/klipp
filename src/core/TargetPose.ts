import type { Quat, Vec3 } from 'math';
import { createTargetExtent, type TargetExtent } from './TargetExtent.js';

/**
 * A target's world transform and how far it reaches. `rotation` is only meaningful when `hasRotation` is true
 * (not for fixed points). `extent` is only read by the composers.
 */
export type TargetPose = { position: Vec3; rotation: Quat; hasRotation: boolean; extent: TargetExtent };

export const createTargetPose = (): TargetPose => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  hasRotation: false,
  extent: createTargetExtent(),
});
