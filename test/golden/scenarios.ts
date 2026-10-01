/**
 * Golden scenarios: each one drives a module through the deterministic world and returns its
 * observable output. These drivers are the ONLY part that follows API changes during the math/DOD
 * migration: when a module's API changes, rewrite its driver so it feeds the same inputs to the new
 * API. Never re-record fixtures to make a failing scenario pass, unless the behavior change is
 * deliberate and documented.
 */
import { vec3, type Vec3 } from 'math';
import { createCameraState, type CameraState } from '../../src/core/CameraState';
import { KlippCore } from '../../src/core/KlippCore';
import { VirtualCameraCore } from '../../src/core/VirtualCameraCore';
import { HardLookAtAim } from '../../src/three/aim/HardLookAtAim';
import { PanTiltAim } from '../../src/three/aim/PanTiltAim';
import { RotateWithFollowTargetAim } from '../../src/three/aim/RotateWithFollowTargetAim';
import { RotationComposerAim } from '../../src/three/aim/RotationComposerAim';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import type { BlendDefinition } from '../../src/core/blend/BlendDefinition';
import { BlendHints } from '../../src/core/blend/BlendHints';
import { BindingModes, type BindingMode } from '../../src/core/body/BindingModes';
import { FollowBody } from '../../src/three/body/FollowBody';
import { HardLockToTargetBody } from '../../src/three/body/HardLockToTargetBody';
import { PositionComposerBody } from '../../src/three/body/PositionComposerBody';
import { GroupFramingExtension } from '../../src/three/extension/GroupFramingExtension';
import { LensExtension } from '../../src/core/extension/LensExtension';
import { TargetGroup } from '../../src/three/extension/TargetGroup';
import { ClearShot } from '../../src/core/groups/ClearShot';
import { MixingCamera } from '../../src/core/groups/MixingCamera';
import { Sequencer } from '../../src/core/groups/Sequencer';
import { StateDrivenCamera } from '../../src/core/groups/StateDrivenCamera';
import { ImpulseField } from '../../src/core/impulse/ImpulseField';
import { ImpulseListenerNoise } from '../../src/core/impulse/ImpulseListenerNoise';
import { BasicMultiChannelPerlinNoise } from '../../src/core/noise/BasicMultiChannelPerlinNoise';
import { orbitCamera, simulate, type World } from './world';
import { advance, register, setPriority } from '../../src/core/internal';

export type Scenario = { name: string; run: () => number[][] };

type Update = (out: CameraState, dt: number, justActivated: boolean) => unknown;

function initialState(): CameraState {
  const state = createCameraState();
  vec3.set(state.position, 0, 2, 15);
  return state;
}

/** A body alone, writing into one state. */
const body = (name: string, make: (w: World) => Update): Scenario => ({
  name,
  run: () =>
    simulate((w) => {
      const update = make(w);
      const state = initialState();
      return (dt, frame) => (update(state, dt, frame === 0), state);
    }),
});

/** An aim alone, with the camera moved along a fixed orbit before each update. */
const aim = (name: string, make: (w: World) => Update, perFrame?: (w: World, dt: number) => void): Scenario => ({
  name,
  run: () =>
    simulate((w) => {
      const update = make(w);
      const state = initialState();
      return (dt, frame) => {
        perFrame?.(w, dt);
        orbitCamera(state, w.clock.time);
        update(state, dt, frame === 0);
        return state;
      };
    }),
});

/** A full controller: Follow + HardLookAt, plus whatever `extra` registers. */
function rig(w: World, extra?: (c: VirtualCameraCore) => void, offset: Vec3 = [0, 3, 8]) {
  const controller = new VirtualCameraCore('rig');
  controller.setBody(new FollowBody(w.target, { offset, damping: 0.4 }));
  controller.setAim(new HardLookAtAim(w.target));
  extra?.(controller);
  const state = initialState();
  return { controller, state };
}

const controllerScenario = (name: string, extra: (c: VirtualCameraCore, w: World) => void): Scenario => ({
  name,
  run: () =>
    simulate((w) => {
      const { controller, state } = rig(w, (c) => extra(c, w));
      return (dt, frame) => (controller.update(state, dt, frame === 0), state);
    }),
});

/** Two cameras (A: Follow + HardLookAt, B: worldSpace Follow + RotationComposer) under KlippCore. */
function coreScenario(name: string, defaultBlend: BlendDefinition, hints: BlendHints = BlendHints.none): Scenario {
  return {
    name,
    run: () =>
      simulate((w) => {
        const a = rig(w);
        const b = new VirtualCameraCore('b');
        b.setBody({
          update: new FollowBody(w.target, { offset: [6, 2, -4], damping: 0.3, bindingMode: BindingModes.worldSpace })
            .update,
        });
        b.setAim({
          update: new RotationComposerAim(w.target, {
            screenPosition: [0.1, 0],
            aspect: 16 / 9,
            deadZone: [0.1, 0.1],
            damping: 0.3,
          }).update,
        });
        const bState = initialState();
        const core = new KlippCore({ defaultBlend });
        core[register]({ id: 'a', priority: 10, state: a.state, hints });
        core[register]({ id: 'b', priority: 5, state: bState, hints });
        return (dt, frame) => {
          a.controller.update(a.state, dt, frame === 0);
          b.update(bState, dt, frame === 0);
          if (frame === 60) core[setPriority]('b', 20);
          if (frame === 170) core[setPriority]('b', 1);
          return core[advance](dt);
        };
      }),
  };
}

const bindingModes: BindingMode[] = Object.values(BindingModes);

export const scenarios: Scenario[] = [
  // bodies
  body('body.hardLockToTarget', (w) => new HardLockToTargetBody(w.target, { damping: 0.3 }).update),
  body(
    'body.hardLockToTarget.maxSpeed',
    (w) => new HardLockToTargetBody(w.target, { damping: 0.3, maxSpeed: 15 }).update,
  ),
  ...bindingModes.map((mode) =>
    body(
      `body.follow.${mode}`,
      (w) => new FollowBody(w.target, { offset: [0, 3, 8], damping: 0.4, bindingMode: mode }).update,
    ),
  ),
  body(
    'body.follow.asymmetricDamping.maxSpeed',
    (w) =>
      new FollowBody(w.target, {
        offset: [1, 3, 8],
        damping: { into: 0.2, from: 0.6 },
        bindingMode: BindingModes.lockToTarget,
        maxSpeed: 20,
      }).update,
  ),
  body(
    'body.positionComposer',
    (w) =>
      new PositionComposerBody(w.target, {
        cameraDistance: 10,
        screenPosition: [0.1, 0],
        aspect: 16 / 9,
        deadZone: [0.1, 0.1],
        damping: 0.3,
        hardLimit: [0.4, 0.4],
        radius: 1,
      }).update,
  ),
  body(
    'body.positionComposer.lookahead',
    (w) =>
      new PositionComposerBody(w.target, {
        cameraDistance: 12,
        screenPosition: [0, 0.1],
        aspect: 16 / 9,
        deadZone: [0.05, 0.05],
        damping: 0.2,
        hardLimit: [0.3, 0.3],
        radius: 1,
        depthDeadZone: 1,
        lookaheadTime: 0.5,
        lookaheadSmoothing: 0.5,
        lookaheadIgnoreY: true,
      }).update,
  ),

  // aims
  aim('aim.hardLookAt', (w) => new HardLookAtAim(w.target).update),
  aim('aim.rotateWithFollowTarget', (w) => new RotateWithFollowTargetAim(w.target, { damping: 0.3 }).update),
  aim(
    'aim.rotationComposer',
    (w) =>
      new RotationComposerAim(w.target, {
        screenPosition: [0.1, -0.1],
        aspect: 16 / 9,
        deadZone: [0.1, 0.1],
        damping: 0.3,
        hardLimit: [0.4, 0.4],
        targetOffset: [0, 0.5, 0],
        radius: 1,
      }).update,
  ),
  aim(
    'aim.rotationComposer.lookahead',
    (w) =>
      new RotationComposerAim(w.target, {
        screenPosition: [0, 0],
        aspect: 16 / 9,
        deadZone: [0.05, 0.05],
        damping: 0.2,
        hardLimit: [0.3, 0.3],
        targetOffset: [0, 0, 0],
        radius: 1,
        lookaheadTime: 0.8,
        lookaheadSmoothing: 0.5,
        lookaheadIgnoreY: true,
      }).update,
  ),
  (() => {
    let panTilt: PanTiltAim;
    return aim(
      'aim.panTilt',
      (w) => {
        panTilt = new PanTiltAim();
        panTilt.target = w.target;
        return panTilt.update;
      },
      (w, dt) => {
        panTilt.pan.applyDelta(Math.sin(w.clock.time) * 120 * dt);
        panTilt.tilt.applyDelta(Math.cos(w.clock.time * 1.3) * 60 * dt);
      },
    );
  })(),

  // extensions
  controllerScenario('extension.lens', (c) => {
    const lens = new LensExtension({
      fov: 35,
      near: 0.2,
      far: 500,
      fovDamping: 0.5,
      nearDamping: 0.3,
      farDamping: 0.3,
    });
    let frames = 0;
    c.addExtension({
      update: (out, dt, justActivated) => {
        if (++frames === 100) {
          lens.fov = 70;
          lens.far = 200;
        }
        return lens.update(out, dt, justActivated);
      },
    });
  }),
  controllerScenario('extension.groupFraming', (c, w) => {
    const group = new TargetGroup([
      { target: w.target, radius: 1 },
      { target: w.memberA, radius: 0.5, weight: 2 },
      { target: w.memberB, radius: 2 },
    ]);
    c.addExtension({
      update: new GroupFramingExtension(group, {
        padding: 0.1,
        viewportWidth: 1920,
        viewportHeight: 1080,
        damping: 0.3,
        screenPosition: [0.05, 0],
        fitMode: 'ceiling',
        minDistance: 5,
        maxDistance: 40,
      }).update,
    });
  }),
  controllerScenario('extension.groupFraming.rigid.horizontal.average', (c, w) => {
    const group = new TargetGroup(
      [
        { target: w.target, radius: 1 },
        { target: w.memberA, radius: 0.5, weight: 2 },
        { target: w.memberB, radius: 2 },
      ],
      'groupAverage',
    );
    c.addExtension({
      update: new GroupFramingExtension(group, {
        padding: 0.2,
        viewportWidth: 1280,
        viewportHeight: 720,
        damping: 0.5,
        screenPosition: [0, 0],
        fitMode: 'rigid',
        minDistance: 2,
        maxDistance: 60,
        framingMode: 'horizontal',
      }).update,
    });
  }),

  // noise
  controllerScenario('noise.perlin', (c) => {
    c.addNoise({
      update: new BasicMultiChannelPerlinNoise({
        positionAmplitude: [0.2, 0.1, 0.2],
        positionFrequency: [1, 1.3, 0.7],
        rotationAmplitude: [2, 1, 0.5],
        rotationFrequency: [0.8, 1.1, 1.6],
        amplitudeGain: 1,
        frequencyGain: 1,
        seed: 1234,
        amplitudeDamping: 0.2,
      }).update,
    });
  }),
  {
    name: 'noise.impulse',
    run: () =>
      simulate((w) => {
        const field = new ImpulseField();
        const listener = new ImpulseListenerNoise({ field, channelMask: 1, gain: 1 });
        const { controller, state } = rig(w);
        return (dt, frame) => {
          const now = w.clock.time; // explicit clock: never performance.now() in golden tests
          if (frame === 20) field.generate({ position: [0, 0, 0], direction: [1, 0.5, 0], duration: 0.6 }, now);
          if (frame === 90) field.generate({ position: [2, 0, 1], direction: [0, 1, 0], duration: 1, radius: 30 }, now);
          controller.update(state, dt, frame === 0);
          listener.update(state, dt, frame === 0, now);
          return state;
        };
      }),
  },

  // core: arbitration + blending
  coreScenario('core.blend.easeInOut', { curve: BlendCurves.easeInOut, time: 1.5 }),
  coreScenario('core.blend.damped', { damping: 0.6 }),
  coreScenario('core.blend.cut', { curve: BlendCurves.cut, time: 0 }),
  coreScenario('core.blend.spherical', { curve: BlendCurves.linear, time: 1.2 }, BlendHints.sphericalPosition),
  coreScenario('core.blend.cylindrical', { curve: BlendCurves.easeInOut, time: 1.2 }, BlendHints.cylindricalPosition),
  coreScenario('core.blend.ignoreTarget', { curve: BlendCurves.easeInOut, time: 1.2 }, BlendHints.ignoreTarget),

  // groups
  {
    name: 'groups.mixingCamera',
    run: () =>
      simulate((w) => {
        const a = rig(w);
        const b = rig(w, undefined, [-5, 6, 2]);
        const slots = [
          { cameraId: 'a', state: a.state, weight: 1 },
          { cameraId: 'b', state: b.state, weight: 0 },
        ];
        const mixer = new MixingCamera(slots);
        return (dt, frame) => {
          a.controller.update(a.state, dt, frame === 0);
          b.controller.update(b.state, dt, frame === 0);
          slots[1].weight = (Math.sin(w.clock.time * 1.5) + 1) * 2;
          return mixer.tick();
        };
      }),
  },
  {
    name: 'groups.sequencer.loop',
    run: () =>
      simulate((w) => {
        const a = rig(w);
        const b = rig(w, undefined, [-5, 6, 2]);
        const sequencer = new Sequencer(
          [
            { cameraId: 'a', state: a.state, hold: 0.8 },
            { cameraId: 'b', state: b.state, hold: 0.6, blend: { curve: BlendCurves.easeIn, time: 0.5 } },
          ],
          { loop: true, defaultBlend: { curve: BlendCurves.easeInOut, time: 0.4 } },
        );
        return (dt, frame) => {
          a.controller.update(a.state, dt, frame === 0);
          b.controller.update(b.state, dt, frame === 0);
          return sequencer.tick(dt);
        };
      }),
  },
  {
    name: 'groups.clearShot',
    run: () =>
      simulate((w) => {
        const a = rig(w);
        const b = rig(w, undefined, [-5, 6, 2]);
        const c = rig(w, undefined, [4, 1, -6]);
        // quality per 0.6 s phase: plain pick, random tie (b/c, committed once a pick holds),
        // priority tie-break (a over b), per-frame flicker (debounced by activateAfter), c wins,
        // then the switch back to a waits out minDuration
        const qualities: Record<string, number>[] = [
          { a: 2, b: 1, c: 1 },
          { a: 1, b: 3, c: 3 },
          { a: 3, b: 3, c: 0 },
          { a: 0, b: 0, c: 0 },
          { a: 0, b: 1, c: 5 },
        ];
        const quality = (id: string): number => {
          const phase = Math.floor(w.clock.time / 0.6) % qualities.length;
          if (phase === 3) return id === (Math.floor(w.clock.time * 60) % 2 ? 'b' : 'c') ? 4 : 0;
          return qualities[phase][id];
        };
        let seed = 1; // deterministic Park-Miller LCG instead of Math.random
        const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const clearShot = new ClearShot(
          [
            { cameraId: 'a', state: a.state, priority: 2 },
            { cameraId: 'b', state: b.state, priority: 1 },
            { cameraId: 'c', state: c.state, priority: 1 },
          ],
          {
            evaluator: (candidate) => quality(candidate.cameraId),
            defaultBlend: { curve: BlendCurves.easeInOut, time: 0.4 },
            activateAfter: 0.05,
            minDuration: 0.8,
            randomizeChoice: true,
            random,
          },
        );
        return (dt, frame) => {
          a.controller.update(a.state, dt, frame === 0);
          b.controller.update(b.state, dt, frame === 0);
          c.controller.update(c.state, dt, frame === 0);
          return clearShot.tick(dt);
        };
      }),
  },
  {
    name: 'groups.stateDriven',
    run: () =>
      simulate((w) => {
        const a = rig(w);
        const b = rig(w, undefined, [-5, 6, 2]);
        const c = rig(w, undefined, [4, 1, -6]);
        const stateDriven = new StateDrivenCamera(
          [
            { cameraId: 'a', state: a.state, priority: 1, forState: 'idle' },
            { cameraId: 'b', state: b.state, priority: 1, forState: 'run' },
            { cameraId: 'c', state: c.state, priority: 5, forState: 'run' },
            { cameraId: 'b', state: b.state, priority: 0, forState: 'aim' },
          ],
          { defaultBlend: { curve: BlendCurves.easeInOut, time: 0.5 } },
        );
        // frames 0-9 sample the untouched default state; 'unknown' holds c; 135 retargets mid-blend
        const states: Record<number, string> = {
          10: 'idle',
          50: 'run',
          90: 'unknown',
          120: 'idle',
          135: 'run',
          200: 'aim',
        };
        return (dt, frame) => {
          a.controller.update(a.state, dt, frame === 0);
          b.controller.update(b.state, dt, frame === 0);
          c.controller.update(c.state, dt, frame === 0);
          if (states[frame]) stateDriven.setState(states[frame]);
          return stateDriven.tick(dt);
        };
      }),
  },
];
