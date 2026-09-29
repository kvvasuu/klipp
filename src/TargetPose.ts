import type { Quat, Vec3 } from 'math';

/** A target's world transform. `rotation` is only meaningful when `hasRotation` is true (not for fixed points). */
export type TargetPose = { position: Vec3; rotation: Quat; hasRotation: boolean };

export const createTargetPose = (): TargetPose => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], hasRotation: false });
