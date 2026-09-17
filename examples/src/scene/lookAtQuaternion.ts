import { Matrix4, Quaternion, Vector3 } from 'three';

const lookMatrix = new Matrix4();

/** Matches `HardLookAt`'s own math - a plain `Object3D.lookAt()` would orient a camera 180° backwards. */
export function lookAtQuaternion(position: [number, number, number], target: [number, number, number]): Quaternion {
  lookMatrix.lookAt(new Vector3(...position), new Vector3(...target), new Vector3(0, 1, 0));
  return new Quaternion().setFromRotationMatrix(lookMatrix);
}

export function addOffset(base: [number, number, number], offset: [number, number, number]): [number, number, number] {
  return [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
}
