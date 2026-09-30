import { quat, vec3, type Quat } from 'math';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../../src/core/CameraState';
import { createPanTiltState, seedPanTilt, updatePanTilt } from '../../../src/core/aim/panTilt';

function roundTrip(targetRotation: Quat | null, rotation: Quat): Quat {
  const state = createPanTiltState();
  const out = createCameraState();
  if (targetRotation) vec3.transformQuat(out.referenceUp, [0, 1, 0], targetRotation);
  seedPanTilt(state, targetRotation, rotation, out.referenceUp);
  // A long step settles both axes on their seeded values.
  updatePanTilt(out, state, targetRotation, 1);
  return out.quaternion;
}

const expectSameRotation = (a: Quat, b: Quat) => expect(Math.abs(quat.dot(a, b))).toBeCloseTo(1, 9);

describe('seedPanTilt', () => {
  it('reproduces the seeded rotation without a target rotation', () => {
    const rotation = quat.fromEuler(quat.create(), [-0.4, 0.9, 0, 'yxz']);
    expectSameRotation(roundTrip(null, rotation), rotation);
  });

  it('reproduces the seeded rotation relative to a pitched target', () => {
    const targetRotation = quat.fromEuler(quat.create(), [0.6, 0.3, 0, 'yxz']);
    const relative = quat.fromEuler(quat.create(), [-0.3, 0.5, 0, 'yxz']);
    const rotation = quat.multiply(quat.create(), targetRotation, relative);
    expectSameRotation(roundTrip(targetRotation, rotation), rotation);
  });
});
