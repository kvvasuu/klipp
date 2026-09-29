import { vec3, type Quat, type Vec3 } from 'math';

/** How far a target reaches: a sphere of `radius`, or (when `hasSize`) a box of `size` with its world `rotation`. */
export type TargetExtent = { radius: number; size: Vec3; rotation: Quat; hasSize: boolean };

export const createTargetExtent = (): TargetExtent => ({
  radius: 0,
  size: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  hasSize: false,
});

const scratchAxisX: Vec3 = [0, 0, 0];
const scratchAxisY: Vec3 = [0, 0, 0];
const scratchAxisZ: Vec3 = [0, 0, 0];

/** Half-extents of `extent` along two world axes. */
export function projectTargetExtent(
  out: [number, number],
  extent: TargetExtent,
  axisA: Vec3,
  axisB: Vec3,
): [number, number] {
  if (!extent.hasSize) {
    out[0] = extent.radius;
    out[1] = extent.radius;
    return out;
  }
  const { size, rotation } = extent;
  vec3.transformQuat(scratchAxisX, vec3.set(scratchAxisX, size[0] * 0.5, 0, 0), rotation);
  vec3.transformQuat(scratchAxisY, vec3.set(scratchAxisY, 0, size[1] * 0.5, 0), rotation);
  vec3.transformQuat(scratchAxisZ, vec3.set(scratchAxisZ, 0, 0, size[2] * 0.5), rotation);
  out[0] =
    Math.abs(vec3.dot(scratchAxisX, axisA)) +
    Math.abs(vec3.dot(scratchAxisY, axisA)) +
    Math.abs(vec3.dot(scratchAxisZ, axisA));
  out[1] =
    Math.abs(vec3.dot(scratchAxisX, axisB)) +
    Math.abs(vec3.dot(scratchAxisY, axisB)) +
    Math.abs(vec3.dot(scratchAxisZ, axisB));
  return out;
}
