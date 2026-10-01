import { bench, group } from '@pmndrs/labs';
import { vec3, type Vec3 } from 'math';
import { BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { createCameraState } from '../src/core/CameraState';
import { KlippCore } from '../src/core/KlippCore';
import { BlendHints } from '../src/core/blend/BlendHints';
import { lerpCameraState } from '../src/core/blend/lerpCameraState';
import { VirtualCameraCore } from '../src/core/VirtualCameraCore';
import { HardLookAtAim } from '../src/three/aim/HardLookAtAim';
import { RotationComposerAim } from '../src/three/aim/RotationComposerAim';
import { FollowBody } from '../src/three/body/FollowBody';
import { HardLockToTargetBody } from '../src/three/body/HardLockToTargetBody';
import { PositionComposerBody } from '../src/three/body/PositionComposerBody';
import { GroupFramingExtension } from '../src/three/extension/GroupFramingExtension';
import { TargetGroup } from '../src/three/extension/TargetGroup';
import { ImpulseField } from '../src/core/impulse/ImpulseField';
import { ImpulseListenerNoiseCore } from '../src/core/impulse/ImpulseListenerNoiseCore';
import { createConsumedInput, type ConsumedInput } from '../src/core/input/consumedInput';
import { InputSystem, MouseButton } from '../src/dom/InputSystem';
import { BasicMultiChannelPerlinNoiseCore } from '../src/core/noise/BasicMultiChannelPerlinNoiseCore';
import { TargetRegistry } from '../src/three/resolve/TargetRegistry';
import { toQuaternion, toTuple } from './tuples';
import { advance, register } from '../src/core/internal';

const always = () => 1;

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
    const body = new HardLockToTargetBody(object, { damping: 0.5 });
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position[0]; // ties the return to the measured work — see "Dead Code Elimination" in @pmndrs/labs' README
    };
  });

  bench('Follow (lockToTarget binding)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new FollowBody(object, { offset: [0, 3, 8], damping: 0.5 });
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position[0];
    };
  });

  bench('PositionComposer (deadZone + hardLimit)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new PositionComposerBody(object, {
      cameraDistance: 10,
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0.2, 0.2],
      damping: 0.5,
      hardLimit: [0.4, 0.4],
    });
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position[0];
    };
  });

  // isolates the Predictor's own added cost - compare against the deadZone+hardLimit bench above, which
  // is identical except lookahead is off
  bench('PositionComposer (deadZone + hardLimit + lookahead)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new PositionComposerBody(object, {
      cameraDistance: 10,
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0.2, 0.2],
      damping: 0.5,
      hardLimit: [0.4, 0.4],
      depthDeadZone: 0,
      lookaheadTime: 0.3,
      lookaheadSmoothing: 1,
    });
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position[0];
    };
  });

  // radius/size give deadZone/hardLimit a screen-space EDGE instead of a point - the radius path skips
  // resolveTargetRotation entirely, while size (explicit or auto-detected) projects a rotated box every
  // frame instead; all three should still show ~0 bytes/iter, same as the plain point-target bench above
  bench('PositionComposer (radius extent)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new PositionComposerBody(object, {
      cameraDistance: 10,
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0.2, 0.2],
      damping: 0.5,
      hardLimit: [0.4, 0.4],
      radius: 1.5,
    });
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position[0];
    };
  });

  bench('PositionComposer (explicit size extent, rotating box)', function* () {
    const { object, step } = makeMovingTarget();
    const body = new PositionComposerBody(object, {
      cameraDistance: 10,
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0.2, 0.2],
      damping: 0.5,
      hardLimit: [0.4, 0.4],
      size: [2, 2, 2],
    });
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position[0];
    };
  });

  bench('PositionComposer (auto-detected Mesh size extent, rotating box)', function* () {
    const { object, step } = makeMovingMeshTarget();
    const body = new PositionComposerBody(object, {
      cameraDistance: 10,
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0.2, 0.2],
      damping: 0.5,
      hardLimit: [0.4, 0.4],
    });
    const out = createCameraState();
    yield () => {
      step();
      body.update(out, 0.016, false);
      return out.position[0];
    };
  });
});

group('Aim.update @aim', () => {
  bench('HardLookAt', function* () {
    const { object, step } = makeMovingTarget();
    const aim = new HardLookAtAim(object);
    const out = createCameraState();
    vec3.set(out.position, 0, 2, 15);
    yield () => {
      step();
      aim.update(out);
      return out.quaternion[0];
    };
  });

  bench('RotationComposer (deadZone + hardLimit)', function* () {
    const { object, step } = makeMovingTarget();
    const aim = new RotationComposerAim(object, {
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0.2, 0.2],
      damping: 0.5,
      hardLimit: [0.4, 0.4],
    });
    const out = createCameraState();
    vec3.set(out.position, 0, 2, 15);
    yield () => {
      step();
      aim.update(out, 0.016, false);
      return out.quaternion[0];
    };
  });

  // isolates the Predictor's own added cost - compare against the deadZone+hardLimit bench above, which
  // is identical except lookahead is off
  bench('RotationComposer (deadZone + hardLimit + lookahead)', function* () {
    const { object, step } = makeMovingTarget();
    const aim = new RotationComposerAim(object, {
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0.2, 0.2],
      damping: 0.5,
      hardLimit: [0.4, 0.4],
      targetOffset: [0, 0, 0],
      lookaheadTime: 0.3,
      lookaheadSmoothing: 1,
    });
    const out = createCameraState();
    vec3.set(out.position, 0, 2, 15);
    yield () => {
      step();
      aim.update(out, 0.016, false);
      return out.quaternion[0];
    };
  });

  // the state a live camera spends most of its frames in, and a different path from the moving benches
  // above: both dampers early-return and the published lookAtTarget takes its exact-copy branch
  bench('RotationComposer (damped, converged on a still target)', function* () {
    const aim = new RotationComposerAim(new Vector3(0, 2, -20), {
      screenPosition: [0, 0],
      aspect: 16 / 9,
      deadZone: [0, 0],
      damping: 0.5,
    });
    const out = createCameraState();
    vec3.set(out.position, 0, 2, 15);
    aim.update(out, 0.016, true);
    yield () => {
      aim.update(out, 0.016, false);
      return out.quaternion[0];
    };
  });
});

group('Noise/Extension.update @noise', () => {
  bench('BasicMultiChannelPerlin', function* () {
    const perlin = new BasicMultiChannelPerlinNoiseCore({
      positionAmplitude: [0.4, 0.4, 0.4],
      positionFrequency: [1, 1, 1],
      rotationAmplitude: [4, 4, 4],
      rotationFrequency: [1, 1, 1],
      amplitudeGain: 1,
      frequencyGain: 1,
      seed: 42,
      amplitudeDamping: 0.5,
    });
    const out = createCameraState();
    yield () => {
      perlin.update(out, 0.016, false);
      return out.position[0];
    };
  });

  bench('GroupFraming (single member)', function* () {
    const targetGroup = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
    const groupFraming = new GroupFramingExtension(targetGroup, {
      padding: 40,
      viewportWidth: 1920,
      viewportHeight: 1080,
      damping: 0.5,
    });
    const out = createCameraState();
    yield () => {
      groupFraming.update(out, 0.016, false);
      return out.position[2];
    };
  });
});

group('ImpulseField.sampleAt @impulse', () => {
  function makeFieldWithEvents(count: number): ImpulseField {
    const field = new ImpulseField();
    for (let i = 0; i < count; i++) {
      field.generate({ position: [i, 0, 0], direction: [1, 0, 0], shape: always, duration: 1000 }, 0);
    }
    return field;
  }

  bench('1 concurrent event', function* () {
    const field = makeFieldWithEvents(1);
    const out: Vec3 = [0, 0, 0];
    const samplePosition: Vec3 = [0, 0, 0];
    let now = 0;
    yield () => {
      now += 0.016;
      field.sampleAt(out, samplePosition, 1, 1, now);
      return out[0];
    };
  });

  bench('10 concurrent events', function* () {
    const field = makeFieldWithEvents(10);
    const out: Vec3 = [0, 0, 0];
    const samplePosition: Vec3 = [0, 0, 0];
    let now = 0;
    yield () => {
      now += 0.016;
      field.sampleAt(out, samplePosition, 1, 1, now);
      return out[0];
    };
  });

  bench('50 concurrent events', function* () {
    const field = makeFieldWithEvents(50);
    const out: Vec3 = [0, 0, 0];
    const samplePosition: Vec3 = [0, 0, 0];
    let now = 0;
    yield () => {
      now += 0.016;
      field.sampleAt(out, samplePosition, 1, 1, now);
      return out[0];
    };
  });
});

group('ImpulseListenerNoiseCore.update @impulse', () => {
  bench('kick only', function* () {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 1000 }, 0);
    const listener = new ImpulseListenerNoiseCore({ field });
    const out = createCameraState();
    let now = 0;
    yield () => {
      now += 0.016;
      listener.update(out, 0.016, false, now);
      return out.position[0];
    };
  });

  // isolates shake's own added cost - compare against the kick-only bench above
  bench('kick + shake', function* () {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 1000 }, 0);
    const shake = new BasicMultiChannelPerlinNoiseCore({
      positionAmplitude: [0.1, 0.1, 0.1],
      rotationAmplitude: [3, 3, 3],
    });
    const listener = new ImpulseListenerNoiseCore({ field, channelMask: 1, gain: 1, shake });
    const out = createCameraState();
    let now = 0;
    yield () => {
      now += 0.016;
      listener.update(out, 0.016, false, now);
      return out.position[0];
    };
  });

  // isolates cameraSpace's own added cost (one applyQuaternion call) - compare against kick-only above
  bench('kick + cameraSpace', function* () {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 1000 }, 0);
    const listener = new ImpulseListenerNoiseCore({ field, channelMask: 1, gain: 1, cameraSpace: true });
    const out = createCameraState();
    let now = 0;
    yield () => {
      now += 0.016;
      listener.update(out, 0.016, false, now);
      return out.position[0];
    };
  });
});

// @pmndrs/labs runs in plain Node, no DOM - a real EventTarget.dispatchEvent() alone costs ~140 b/iter
// here (measured separately), so these call the private handlers directly to isolate their own allocations.
group('InputSystem event handlers @input', () => {
  type Handlers = Pick<InputSystem, 'connect' | 'consume'> & {
    onPointerDown: (event: unknown) => void;
    onPointerMove: (event: unknown) => void;
    onWheel: (event: unknown) => void;
  };

  function makeConnectedInputSystem(): { system: Handlers; element: object } {
    const fakeDocument = {
      pointerLockElement: null as object | null,
      addEventListener: () => {},
      removeEventListener: () => {},
      exitPointerLock: () => {},
    };
    (globalThis as unknown as { document: unknown }).document = fakeDocument;
    const element = {
      style: {} as Record<string, string>,
      addEventListener: () => {},
      removeEventListener: () => {},
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
    };
    const system = new InputSystem() as unknown as Handlers;
    system.connect(element as unknown as HTMLElement);
    return { system, element };
  }

  function emptyInput(): ConsumedInput {
    return createConsumedInput();
  }

  bench('onPointerMove (button held, unlocked drag)', function* () {
    const { system, element } = makeConnectedInputSystem();
    system.onPointerDown({ pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, target: element });
    const moveEvent = { pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, buttons: MouseButton.left };
    const out = emptyInput();
    let x = 0;
    yield () => {
      x += 1;
      moveEvent.clientX = x;
      system.onPointerMove(moveEvent);
      system.consume(out);
      return out.leftDx;
    };
  });

  bench('onPointerMove (buttonless, Pointer Lock active)', function* () {
    const { system, element } = makeConnectedInputSystem();
    // requestPointerLock() has no effect on a fake element - simulate the browser having granted it
    (globalThis as unknown as { document: { pointerLockElement: unknown } }).document.pointerLockElement = element;
    const moveEvent = {
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      buttons: 0,
      movementX: 1,
      movementY: 0,
    };
    const out = emptyInput();
    yield () => {
      system.onPointerMove(moveEvent);
      system.consume(out);
      return out.lockedDx;
    };
  });

  bench('onWheel', function* () {
    const { system } = makeConnectedInputSystem();
    const wheelEvent = {
      clientX: 0,
      clientY: 0,
      deltaX: 0,
      deltaY: 1,
      ctrlKey: false,
      shiftKey: false,
      preventDefault: () => {},
    };
    const out = emptyInput();
    yield () => {
      system.onWheel(wheelEvent);
      system.consume(out);
      return out.wheelDeltaY;
    };
  });
});

group('VirtualCameraCore.update @controller', () => {
  bench('minimal: HardLockToTarget + HardLookAt', function* () {
    const { object, step } = makeMovingTarget();
    const controller = new VirtualCameraCore('minimal');
    controller.setBody(new HardLockToTargetBody(object, { damping: 0.5 }));
    controller.setAim(new HardLookAtAim(object));
    const out = createCameraState();
    yield () => {
      step();
      controller.update(out, 0.016, false);
      return out.position[0];
    };
  });

  bench('full: Follow + RotationComposer + GroupFraming + Perlin (like FocusReproScene)', function* () {
    const { object, step } = makeMovingTarget();
    const controller = new VirtualCameraCore('full');
    const targetGroup = new TargetGroup([{ target: object, radius: 1.5 }]);
    controller.setBody(new FollowBody(object, { offset: [0, 3, 12], damping: 0.5 }));
    controller.setAim({
      update: new RotationComposerAim(object, {
        screenPosition: [0, 0],
        aspect: 16 / 9,
        deadZone: [0.15, 0.15],
        damping: 0.5,
      }).update,
    });
    controller.addExtension({
      update: new GroupFramingExtension(targetGroup, {
        padding: 40,
        viewportWidth: 1920,
        viewportHeight: 1080,
        damping: 0.5,
      }).update,
    });
    controller.addNoise({
      update: new BasicMultiChannelPerlinNoiseCore({
        positionAmplitude: [0.1, 0.1, 0.1],
        positionFrequency: [1, 1, 1],
        rotationAmplitude: [2, 2, 2],
        rotationFrequency: [1, 1, 1],
        amplitudeGain: 1,
        frequencyGain: 1,
        seed: 7,
        amplitudeDamping: 0.5,
      }).update,
    });
    const out = createCameraState();
    yield () => {
      step();
      controller.update(out, 0.016, false);
      return out.position[0];
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
      vec3.set(state.position, i, 0, 0);
      core[register]({ id: `cam-${i}`, priority: i, state });
    }
    return core;
  }

  bench('1 registered camera', function* () {
    const core = makeCoreWithCameras(1);
    yield () => core[advance](0.016).position[0];
  });

  bench('10 registered cameras', function* () {
    const core = makeCoreWithCameras(10);
    yield () => core[advance](0.016).position[0];
  });

  bench('50 registered cameras', function* () {
    const core = makeCoreWithCameras(50);
    yield () => core[advance](0.016).position[0];
  });
});

/** `lerpCameraState` in isolation, one call per iteration - the actual per-frame cost of each rotation
 *  path during an in-progress blend (settled/non-blending frames never call this at all). */
group('lerpCameraState @blend', () => {
  function makeOrbitingState(position: Vector3, lookAtTarget: Vector3) {
    const state = createCameraState();
    position.toArray(state.position);
    new Quaternion()
      .setFromRotationMatrix(new Matrix4().lookAt(position, lookAtTarget, new Vector3(0, 1, 0)))
      .toArray(state.quaternion);
    lookAtTarget.toArray(state.target);
    state.hasTarget = true;
    lookAtTarget.toArray(state.lookAtTarget);
    state.hasLookAtTarget = true;
    return state;
  }

  bench('plain slerp (no lookAtTarget)', function* () {
    const a = createCameraState();
    vec3.set(a.position, 5, 5, 5);
    const b = createCameraState();
    vec3.set(b.position, 0, 0, 5);
    toQuaternion(b.quaternion)
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
      .toArray(b.quaternion);
    const out = createCameraState();
    yield () => lerpCameraState(out, a, b, 0.5).position[0];
  });

  bench('lookAtTarget-driven rotation', function* () {
    const a = makeOrbitingState(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
    const b = makeOrbitingState(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
    const out = createCameraState();
    yield () => lerpCameraState(out, a, b, 0.5).position[0];
  });

  bench('lookAtTarget-driven rotation + sphericalPosition hint', function* () {
    const a = makeOrbitingState(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
    const b = makeOrbitingState(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
    const out = createCameraState();
    yield () => lerpCameraState(out, a, b, 0.5, BlendHints.sphericalPosition).position[0];
  });
});

/** A target `depth` levels below a moving root. Matrices are left stale, as in a real frame before render. */
function makeNestedTarget(depth: number): { object: Object3D; step: () => void } {
  const root = new Object3D();
  let leaf = root;
  for (let d = 0; d < depth; d++) {
    const child = new Object3D();
    child.position.set(0.1, 0.2, 0);
    child.rotation.set(0, 0.1, 0);
    leaf.add(child);
    leaf = child;
  }
  let t = 0;
  return {
    object: leaf,
    step: () => {
      t += 0.016;
      root.position.set(Math.sin(t) * 10, 2, Math.cos(t) * 10);
    },
  };
}

/** Two cameras, each Follow + HardLookAt on the same target, with or without registry slots. */
function* twoCamerasOnSharedTarget(depth: number, withRegistry: boolean) {
  const { object, step } = makeNestedTarget(depth);
  const registry = new TargetRegistry();
  const cameras = [new Vector3(0, 3, 8), new Vector3(5, 2, 0)].map((offset) => {
    const follow = new FollowBody(object, { offset: toTuple(offset), damping: 0.5 });
    const look = new HardLookAtAim(object);
    if (withRegistry) follow.targetSlot = look.targetSlot = registry.acquire(object);
    return { follow, look, out: createCameraState() };
  });
  yield () => {
    step();
    if (withRegistry) registry.refresh();
    for (const { follow, look, out } of cameras) {
      follow.update(out, 0.016, false);
      look.update(out);
    }
    return cameras[0].out.position[0];
  };
}

group('Target reads, two cameras on one target @targets', () => {
  bench('depth 2, each stage resolves', () => twoCamerasOnSharedTarget(2, false));
  bench('depth 2, registry slots', () => twoCamerasOnSharedTarget(2, true));
  bench('depth 10, each stage resolves', () => twoCamerasOnSharedTarget(10, false));
  bench('depth 10, registry slots', () => twoCamerasOnSharedTarget(10, true));
});

// How to read the output: `avg (min…max) p75/p99` is time per call — compare that to a frame's budget
// (16.67ms at 60fps, 8.33ms at 120fps) to see how many of these fit in one frame. Don't read allocations
// off the `heap` row: it overstates per-call bytes by orders of magnitude for sub-microsecond calls. Run
// `pnpm bench --baseline` once to save a reference point, then `pnpm bench --compare` after a change to
// see if it moved outside noise (statistically, not just eyeballed).
