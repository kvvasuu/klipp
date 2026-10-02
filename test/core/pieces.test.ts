import { quat, vec3 } from 'math';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../src/core/CameraState';
import { createTargetPose } from '../../src/core/TargetPose';
import { HardLookAtAim } from '../../src/core/aim/HardLookAtAim';
import { PanTiltAim } from '../../src/core/aim/PanTiltAim';
import { RotateWithFollowTargetAim } from '../../src/core/aim/RotateWithFollowTargetAim';
import { RotationComposerAim } from '../../src/core/aim/RotationComposerAim';
import { createPanTiltState, updatePanTilt } from '../../src/core/aim/panTilt';
import { updateHardLookAt } from '../../src/core/aim/hardLookAt';
import {
  createRotateWithFollowTargetParams,
  createRotateWithFollowTargetState,
  updateRotateWithFollowTarget,
} from '../../src/core/aim/rotateWithFollowTarget';
import {
  createRotationComposerParams,
  createRotationComposerState,
  updateRotationComposer,
} from '../../src/core/aim/rotationComposer';
import { FollowBody } from '../../src/core/body/FollowBody';
import { HardLockToTargetBody } from '../../src/core/body/HardLockToTargetBody';
import { PositionComposerBody } from '../../src/core/body/PositionComposerBody';
import { createFollowParams, createFollowState, updateFollow } from '../../src/core/body/follow';
import {
  createHardLockToTargetParams,
  createHardLockToTargetState,
  updateHardLockToTarget,
} from '../../src/core/body/hardLockToTarget';
import {
  createPositionComposerParams,
  createPositionComposerState,
  updatePositionComposer,
} from '../../src/core/body/positionComposer';
import { GroupFramingExtension } from '../../src/core/extension/GroupFramingExtension';
import {
  createGroupFramingParams,
  createGroupFramingState,
  createGroupMember,
  updateGroupFraming,
} from '../../src/core/extension/groupFraming';

type Step = (out: CameraState, dt: number, justActivated: boolean) => unknown;
type Pose = ReturnType<typeof createTargetPose>;

/** Runs a piece and its function side by side on one pose that moves and turns every frame. */
function expectSameAs(piece: (pose: Pose) => { update: Step }, fn: (pose: Pose) => Step) {
  const pose = createTargetPose();
  pose.hasRotation = true;
  pose.extent.radius = 0.5;
  const a = { out: createCameraState(), step: piece(pose).update };
  const b = { out: createCameraState(), step: fn(pose) };
  vec3.set(a.out.position, 0, 2, 15);
  vec3.set(b.out.position, 0, 2, 15);
  for (let i = 0; i < 30; i++) {
    vec3.set(pose.position, Math.sin(i * 0.2) * 4, 0, -i * 0.3);
    quat.setAxisAngle(pose.rotation, [0, 1, 0], i * 0.1);
    a.step(a.out, 1 / 60, i === 0);
    b.step(b.out, 1 / 60, i === 0);
    expect(a.out).toEqual(b.out);
  }
}

const damped = { damping: 0.3 };
const composed = { damping: 0.3, deadZone: [0.1, 0.1] as [number, number] };

describe('core pieces', () => {
  it('match their functions step for step on a TargetPose the caller updates', () => {
    expectSameAs(
      (pose) => new HardLockToTargetBody(pose, damped),
      (pose) => {
        const state = createHardLockToTargetState();
        const params = createHardLockToTargetParams(damped);
        return (out, dt, ja) => updateHardLockToTarget(out, state, params, pose.position, dt, ja);
      },
    );
    expectSameAs(
      (pose) => new FollowBody(pose, damped),
      (pose) => {
        const state = createFollowState();
        const params = createFollowParams(damped);
        return (out, dt, ja) => updateFollow(out, state, params, pose, dt, ja);
      },
    );
    expectSameAs(
      (pose) => new PositionComposerBody(pose, composed),
      (pose) => {
        const state = createPositionComposerState();
        const params = createPositionComposerParams(composed);
        return (out, dt, ja) => updatePositionComposer(out, state, params, pose, dt, ja);
      },
    );
    expectSameAs(
      (pose) => new HardLookAtAim(pose),
      (pose) => (out) => updateHardLookAt(out, pose.position),
    );
    expectSameAs(
      (pose) => new RotateWithFollowTargetAim(pose, damped),
      (pose) => {
        const state = createRotateWithFollowTargetState();
        const params = createRotateWithFollowTargetParams(damped);
        return (out, dt, ja) => updateRotateWithFollowTarget(out, state, params, pose.rotation, dt, ja);
      },
    );
    expectSameAs(
      (pose) => new RotationComposerAim(pose, composed),
      (pose) => {
        const state = createRotationComposerState();
        const params = createRotationComposerParams(composed);
        return (out, dt, ja) => updateRotationComposer(out, state, params, pose, dt, ja);
      },
    );
    expectSameAs(
      (pose) => {
        const aim = new PanTiltAim(pose);
        aim.pan.applyDelta(30);
        return aim;
      },
      (pose) => {
        const state = createPanTiltState();
        state.pan.applyDelta(30);
        return (out, dt) => updatePanTilt(out, state, pose.rotation, dt);
      },
    );
  });

  it('GroupFramingExtension matches updateGroupFraming on new members the caller updates', () => {
    const members = [createGroupMember(), createGroupMember()];
    members.forEach((member, i) => {
      vec3.set(member.position, i * 4 - 2, 0, -10);
      member.extent.radius = 1;
    });
    const options = { damping: 0.3, viewportWidth: 800, viewportHeight: 600 };
    const extension = new GroupFramingExtension(members, 'groupAverage', options);
    const state = createGroupFramingState();
    const params = createGroupFramingParams(options);
    const a = createCameraState();
    const b = createCameraState();

    for (let i = 0; i < 20; i++) {
      members[1].position[0] = 2 + i * 0.5;
      extension.update(a, 1 / 60, i === 0);
      updateGroupFraming(b, state, params, members, 'groupAverage', 1 / 60, i === 0);
      expect(a).toEqual(b);
    }
    expect(a.position[2]).toBeGreaterThan(0);
  });
});
