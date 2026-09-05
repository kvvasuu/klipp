import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../src/CameraState';
import { HardLookAtAim } from '../../src/aim/HardLookAtAim';
import { RotationComposerAim } from '../../src/aim/RotationComposerAim';
import { BlendDriver } from '../../src/blend/BlendDriver';
import { FollowBody } from '../../src/body/FollowBody';
import { HardLockToTargetBody } from '../../src/body/HardLockToTargetBody';

const dt = 1 / 60;

/**
 * The shape this guards (see `example/`'s "LookAt Blend Pop" scene): a `HardLookAt` framing camera
 * blending into a `HardLockToTarget` + damped `RotationComposer` focus camera, retargeted WHILE that
 * blend is still running. Both publish `hasLookAtTarget`, so the composite goes through
 * `lerpLookAtRotation` — the path that popped (2.95° in the retarget tick against 0.02° before it).
 */
function runFocusPull(retargetAtTick: number | null, reactivateOntoSameTargetFirst = false): number[] {
  const productCenter = new Vector3(0, 0, 0);
  const defaultState = createCameraState();
  const focusedState = createCameraState();

  const defaultBody = new FollowBody(productCenter, new Vector3(0, 4, 16), 0);
  const defaultAim = new HardLookAtAim(productCenter);

  const firstFocus = { position: new Vector3(-6, 3, 7), lookAt: new Vector3(-6, 1, 0) };
  const secondFocus = { position: new Vector3(6, 1, -4), lookAt: new Vector3(6, 5, 1) };

  const focusedBody = new HardLockToTargetBody(firstFocus.position, 0.5);
  const focusedAim = new RotationComposerAim(firstFocus.lookAt, [0, 0], 1, [0, 0], 0.5);

  const driver = new BlendDriver<'default' | 'focused'>((id) => (id === 'default' ? defaultState : focusedState));

  function tickBoth(justActivatedFocused: boolean): void {
    defaultBody.update(defaultState, dt, false);
    defaultAim.update(defaultState);
    focusedBody.update(focusedState, dt, justActivatedFocused);
    focusedAim.update(focusedState, dt, justActivatedFocused);
  }

  // an INACTIVE <VirtualCamera> doesn't register its update at all, so "focused" must not tick before its
  // activation frame — that would consume its dampers' activation snap early
  for (let i = 0; i < 30; i++) {
    defaultBody.update(defaultState, dt, false);
    defaultAim.update(defaultState);
  }
  driver.setTarget('default', { damping: 0.5 });
  driver.tick(dt);

  // the click: "focused" wins arbitration and the blend starts (damping 0.5, as in the app's defaultBlend)
  tickBoth(true);
  driver.setTarget('focused', { damping: 0.5 });

  if (reactivateOntoSameTargetFirst) {
    // reactivation onto the SAME point (the demo's "Auto repro" clearing the focus and setting it again a
    // frame later) — the stored rotation is already correct, so there is nothing to snap here
    for (let i = 0; i < 3; i++) tickBoth(false);
    tickBoth(true);
  }

  const steps: number[] = [];
  const previous = createCameraState();
  let hasPrevious = false;

  for (let tick = 0; tick < 60; tick++) {
    if (tick === retargetAtTick) {
      // the second click, mid-blend: both targets change in place, nothing re-activates
      focusedBody.target = secondFocus.position;
      focusedAim.target = secondFocus.lookAt;
    }
    tickBoth(false);
    const out: CameraState = driver.tick(dt);

    if (hasPrevious) steps.push((previous.quaternion.angleTo(out.quaternion) * 180) / Math.PI);
    previous.quaternion.copy(out.quaternion);
    hasPrevious = true;
  }

  return steps;
}

describe('retargeting a damped-Aim camera mid-blend', () => {
  it('has no single tick that dwarfs its neighbours - the visible "snap"', () => {
    const steps = runFocusPull(9);

    for (let i = 1; i < steps.length - 1; i++) {
      // a damped curve accelerates gradually; a pop stands far above BOTH neighbours in one tick
      expect(steps[i]).toBeLessThan(Math.max(steps[i - 1], steps[i + 1]) * 3 + 0.01);
    }
  });

  it('still eases when the camera was reactivated onto the target it was ALREADY on just before the retarget', () => {
    const steps = runFocusPull(9, true);

    for (let i = 1; i < steps.length - 1; i++) {
      // `QuaternionDamper.reset()` must spend its armed snap on that activation — left armed, it fired
      // here instead and teleported ~67° in one tick
      expect(steps[i]).toBeLessThan(Math.max(steps[i - 1], steps[i + 1]) * 3 + 0.01);
    }
  });

  it('the retarget tick itself stays in scale with the tick right before it', () => {
    const steps = runFocusPull(9);
    // steps[0] is the step INTO tick 1, so the retarget at tick 9 lands on steps[8]
    const beforeRetarget = steps[7];
    const retargetTick = steps[8];

    // before the fix: 2.949° against 0.020°
    expect(retargetTick).toBeLessThan(beforeRetarget * 5 + 0.01);
  });
});
