import { bench, group } from '@pmndrs/labs';
import { BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { createCameraState } from '../src/CameraState';
import { KlippCore } from '../src/KlippCore';
import { BlendHints } from '../src/blend/BlendHints';
import { lerpCameraState } from '../src/blend/lerpCameraState';
import { VirtualCameraController } from '../src/VirtualCameraController';
import { HardLookAtAim } from '../src/aim/HardLookAtAim';
import { RotationComposerAim } from '../src/aim/RotationComposerAim';
import { FollowBody } from '../src/body/FollowBody';
import { HardLockToTargetBody } from '../src/body/HardLockToTargetBody';
import { PositionComposerBody } from '../src/body/PositionComposerBody';
import { GroupFramingExtension } from '../src/framing/GroupFramingExtension';
import { TargetGroup } from '../src/framing/TargetGroup';
import { BasicMultiChannelPerlinNoise } from '../src/noise/BasicMultiChannelPerlinNoise';

/** A moving Object3D target — same shape a real scene's tracked character/prop would be, exercising
 *  `resolveTargetPosition`/`resolveTargetRotation`'s Object3D path (matrixWorld reads), not just a bare
 *  Vector3. Advances a little each call so damped writers never fully settle (the realistic case: a
 *  camera is doing WORK most frames, not sitting converged). */
function makeMovingTarget(): { object: Object3D; step: () => void } {
  const object = new Object3D();
  let t = 0;
  return {
    object,
    step: () => {
      t += 0.016;
      object.position.set(Math.sin(t) * 10, 2, Math.cos(t) * 10);
      object.rotation.set(0, t * 0.3, 0);
      object.updateMatrixWorld(true);
    },
  };
}

/** Same motion as `makeMovingTarget`, but a real `Mesh` — exercises `resolveTargetSize`'s auto-detect path
 *  (`geometry.boundingBox`/`getWorldScale`), not just an explicit `size`. */
function makeMovingMeshTarget(): { object: Mesh; step: () => void } {
  const object = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  let t = 0;
  return {
    object,
    step: () => {
      t += 0.016;
      object.position.set(Math.sin(t) * 10, 2, Math.cos(t) * 10);
      object.rotation.set(0, t * 0.3, 0);
      object.updateMatrixWorld(true);
    },
  };
}

group('Body.update @body', () => {
  bench('HardLockToTarget', function* () {
    const { object, step } = makeMovingTarget();
    const body = new HardLockToTargetBody(object, 0.5);
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position.x; // ties the return to the measured work — see "Dead Code Elimination" in @pmndrs/labs' README
    };
  });

  bench('Follow (lockToTarget binding)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new FollowBody(object, new Vector3(0, 3, 8), 0.5);
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position.x;
    };
  });

  bench('PositionComposer (deadZone + hardLimit)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new PositionComposerBody(object, 10, [0, 0], 16 / 9, [0.2, 0.2], 0.5, [0.4, 0.4]);
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position.x;
    };
  });

  // radius/size give deadZone/hardLimit a screen-space EDGE instead of a point - the radius path skips
  // resolveTargetRotation entirely, while size (explicit or auto-detected) projects a rotated box every
  // frame instead; all three should still show ~0 bytes/iter, same as the plain point-target bench above
  bench('PositionComposer (radius extent)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new PositionComposerBody(object, 10, [0, 0], 16 / 9, [0.2, 0.2], 0.5, [0.4, 0.4], 1.5);
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position.x;
    };
  });

  bench('PositionComposer (explicit size extent, rotating box)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new PositionComposerBody(object, 10, [0, 0], 16 / 9, [0.2, 0.2], 0.5, [0.4, 0.4], undefined, [2, 2, 2]);
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position.x;
    };
  });

  bench('PositionComposer (auto-detected Mesh size extent, rotating box)', function* () {
    const { object, step } = makeMovingMeshTarget();
    const body = new PositionComposerBody(object, 10, [0, 0], 16 / 9, [0.2, 0.2], 0.5, [0.4, 0.4]);
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position.x;
    };
  });
});

group('Aim.update @aim', () => {
  bench('HardLookAt', function* () {
    const { object, step } = makeMovingTarget();
    const aim = new HardLookAtAim(object);
    const out = createCameraState();
    out.position.set(0, 2, 15);
    yield () => {
      step();
      aim.update(out);
      return out.quaternion.x;
    };
  });

  bench('RotationComposer (deadZone + hardLimit)', function* () {
    const { object, step } = makeMovingTarget();
    const aim = new RotationComposerAim(object, [0, 0], 16 / 9, [0.2, 0.2], 0.5, [0.4, 0.4]);
    const out = createCameraState();
    out.position.set(0, 2, 15);
    yield () => {
      step();
      aim.update(out, 0.016, false);
      return out.quaternion.x;
    };
  });

  // the state a live camera spends most of its frames in, and a different path from the moving benches
  // above: both dampers early-return and the published lookAtTarget takes its exact-copy branch
  bench('RotationComposer (damped, converged on a still target)', function* () {
    const aim = new RotationComposerAim(new Vector3(0, 2, -20), [0, 0], 16 / 9, [0, 0], 0.5);
    const out = createCameraState();
    out.position.set(0, 2, 15);
    aim.update(out, 0.016, true);
    yield () => {
      aim.update(out, 0.016, false);
      return out.quaternion.x;
    };
  });
});

group('Noise/Extension.update @noise', () => {
  bench('BasicMultiChannelPerlin', function* () {
    const perlin = new BasicMultiChannelPerlinNoise(
      new Vector3(0.4, 0.4, 0.4),
      new Vector3(1, 1, 1),
      new Vector3(4, 4, 4),
      new Vector3(1, 1, 1),
      1,
      1,
      42,
      0.5,
    );
    const out = createCameraState();
    yield () => {
      perlin.update(out, 0.016, false);
      return out.position.x;
    };
  });

  bench('GroupFraming (single member)', function* () {
    const targetGroup = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
    const groupFraming = new GroupFramingExtension(targetGroup, 40, 1920, 1080, 0.5);
    const out = createCameraState();
    yield () => {
      groupFraming.update(out, 0.016, false);
      return out.position.z;
    };
  });
});

group('VirtualCameraController.update @controller', () => {
  bench('minimal: HardLockToTarget + HardLookAt', function* () {
    const { object, step } = makeMovingTarget();
    const controller = new VirtualCameraController('minimal');
    controller.registerBody(new HardLockToTargetBody(object, 0.5).update);
    controller.registerAim(new HardLookAtAim(object).update);
    const out = createCameraState();
    yield () => {
      step();
      controller.update(out, 0.016, false);
      return out.position.x;
    };
  });

  bench('full: Follow + RotationComposer + GroupFraming + Perlin (like FocusReproScene)', function* () {
    const { object, step } = makeMovingTarget();
    const controller = new VirtualCameraController('full');
    const targetGroup = new TargetGroup([{ target: object, radius: 1.5 }]);
    controller.registerBody(new FollowBody(object, new Vector3(0, 3, 12), 0.5).update);
    controller.registerAim(new RotationComposerAim(object, [0, 0], 16 / 9, [0.15, 0.15], 0.5).update);
    controller.registerExtension(new GroupFramingExtension(targetGroup, 40, 1920, 1080, 0.5).update);
    controller.registerNoise(
      new BasicMultiChannelPerlinNoise(
        new Vector3(0.1, 0.1, 0.1),
        new Vector3(1, 1, 1),
        new Vector3(2, 2, 2),
        new Vector3(1, 1, 1),
        1,
        1,
        7,
        0.5,
      ).update,
    );
    const out = createCameraState();
    yield () => {
      step();
      controller.update(out, 0.016, false);
      return out.position.x;
    };
  });
});

/** `KlippCore.tick()` in isolation — arbitration (pick the priority winner) + blend (lerpCameraState
 *  toward it). Registered cameras' own `state` is just a static snapshot here (no Body/Aim running) so
 *  this isolates tick()'s OWN cost from whatever's driving each camera's state. */
group('KlippCore.tick @core', () => {
  function makeCoreWithCameras(count: number): KlippCore {
    const core = new KlippCore();
    for (let i = 0; i < count; i++) {
      const state = createCameraState();
      state.position.set(i, 0, 0);
      core.registerCamera({ id: `cam-${i}`, priority: i, state });
    }
    return core;
  }

  bench('1 registered camera', function* () {
    const core = makeCoreWithCameras(1);
    yield () => core.tick(0.016).position.x;
  });

  bench('10 registered cameras', function* () {
    const core = makeCoreWithCameras(10);
    yield () => core.tick(0.016).position.x;
  });

  bench('50 registered cameras', function* () {
    const core = makeCoreWithCameras(50);
    yield () => core.tick(0.016).position.x;
  });
});

/** `lerpCameraState` in isolation, one call per iteration - the actual per-frame cost of each rotation
 *  path during an in-progress blend (settled/non-blending frames never call this at all). */
group('lerpCameraState @blend', () => {
  function makeOrbitingState(position: Vector3, lookAtTarget: Vector3) {
    const state = createCameraState();
    state.position.copy(position);
    state.quaternion.setFromRotationMatrix(new Matrix4().lookAt(position, lookAtTarget, new Vector3(0, 1, 0)));
    state.target.copy(lookAtTarget);
    state.hasTarget = true;
    state.lookAtTarget.copy(lookAtTarget);
    state.hasLookAtTarget = true;
    return state;
  }

  bench('plain slerp (no lookAtTarget)', function* () {
    const a = createCameraState();
    a.position.set(5, 5, 5);
    const b = createCameraState();
    b.position.set(0, 0, 5);
    b.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const out = createCameraState();
    yield () => lerpCameraState(out, a, b, 0.5).position.x;
  });

  bench('lookAtTarget-driven rotation', function* () {
    const a = makeOrbitingState(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
    const b = makeOrbitingState(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
    const out = createCameraState();
    yield () => lerpCameraState(out, a, b, 0.5).position.x;
  });

  bench('lookAtTarget-driven rotation + sphericalPosition hint', function* () {
    const a = makeOrbitingState(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
    const b = makeOrbitingState(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
    const out = createCameraState();
    yield () => lerpCameraState(out, a, b, 0.5, BlendHints.sphericalPosition).position.x;
  });
});

// How to read the output: `avg (min…max) p75/p99` is time per call — compare that to a frame's budget
// (16.67ms at 60fps, 8.33ms at 120fps) to see how many of these fit in one frame. The `heap` row matters
// most for klipp specifically: zero-allocation rule means every one of these should show
// ~0 bytes/iter at steady state — a nonzero, growing heap number on a Body/Aim/Noise/Extension bench
// means something in that hot path is allocating despite the rule, worth chasing down even if the timing
// itself still looks fast. Run `pnpm bench --baseline` once to save a reference point, then `pnpm bench
// --compare` after a change to see if it moved outside noise (statistically, not just eyeballed).
