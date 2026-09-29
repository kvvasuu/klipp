/**
 * Per-frame allocation guard. Run: `pnpm bench:alloc`.
 *
 * Emulates what <Klipp> does each frame (camera updates, core.tick, write to the real camera) and
 * measures bytes allocated per frame with v8.GCProfiler, which reports every GC synchronously.
 *
 * Runs with `--single-threaded`: without it, concurrent JIT tier-up makes V8's number boxing vary by
 * ~50-100 B/frame between runs, as much as a real allocation. Single-threaded, readings repeat to the
 * byte, so budgets are exact and a tolerance of 16 B catches any new object in a hot path (a
 * `new Vector3()` adds ~100 B). Budgets include V8 boxing of doubles across non-inlined calls, which
 * does not show up in source and shifts when call structure changes (e.g. adding a wrapper layer):
 * re-measure after such refactors and justify budget changes in the commit message.
 * Budgets are for Node 22 (CI). Re-measure when the Node major version changes.
 */
import { GCProfiler, getHeapStatistics } from 'node:v8';
import { vec3 } from 'math';
import { Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { createCameraState } from '../src/core/CameraState';
import { KlippCore } from '../src/core/KlippCore';
import { VirtualCameraController } from '../src/core/VirtualCameraController';
import { HardLookAtAim } from '../src/three/aim/HardLookAtAim';
import { RotationComposerAim } from '../src/three/aim/RotationComposerAim';
import { FollowBody } from '../src/three/body/FollowBody';
import { lerpCameraState } from '../src/core/blend/lerpCameraState';
import { GroupFramingExtension } from '../src/three/extension/GroupFramingExtension';
import { TargetGroup } from '../src/three/extension/TargetGroup';
import { BasicMultiChannelPerlinNoise } from '../src/three/noise/BasicMultiChannelPerlinNoise';
import { TargetRegistry, type TargetSlot } from '../src/three/resolve/TargetRegistry';

const FRAMES = 300_000;
const WARMUP = 50_000;
const TOLERANCE = 16; // bytes/frame above budget before failing

function bytesPerFrame(frame: () => void): number {
  for (let i = 0; i < WARMUP; i++) frame();
  const profiler = new GCProfiler();
  const start = getHeapStatistics().used_heap_size;
  profiler.start();
  for (let i = 0; i < FRAMES; i++) frame();
  const end = getHeapStatistics().used_heap_size;
  const { statistics } = profiler.stop();
  let allocated = 0;
  let previous = start;
  for (const gc of statistics) {
    allocated += gc.beforeGC.heapStatistics.usedHeapSize - previous;
    previous = gc.afterGC.heapStatistics.usedHeapSize;
  }
  allocated += end - previous;
  return allocated / FRAMES;
}

function movingTarget() {
  const object = new Object3D();
  const clock = { t: 0 }; // object field, not a closure `let`: context slots box doubles in V8
  const step = () => {
    clock.t += 1 / 60;
    object.position.set(Math.sin(clock.t) * 10, 2, Math.cos(clock.t) * 10);
    object.rotation.set(0, clock.t * 0.3, 0);
    object.updateMatrixWorld(true);
  };
  return { object, step };
}

/** One <Klipp> frame: targets refresh, every camera updates, the core ticks, the result lands on a real camera. */
function klippFrame(
  setup: (target: Object3D, controller: VirtualCameraController, slot: TargetSlot) => void,
  cameraCount = 1,
) {
  const { object, step } = movingTarget();
  const registry = new TargetRegistry();
  const core = new KlippCore();
  const cameras = Array.from({ length: cameraCount }, (_, i) => {
    const controller = new VirtualCameraController(`cam${i}`);
    setup(object, controller, registry.acquire(object));
    const state = createCameraState();
    core.registerCamera({ id: `cam${i}`, priority: cameraCount - i, state });
    return { controller, state };
  });
  const camera = new PerspectiveCamera();
  return () => {
    step();
    registry.refresh();
    for (const { controller, state } of cameras) controller.update(state, 1 / 60, false);
    const result = core.tick(1 / 60);
    camera.position.fromArray(result.position);
    camera.quaternion.fromArray(result.quaternion);
  };
}

/** Hands a stage its registry slot, as the React components do. */
function withSlot<T extends { targetSlot: TargetSlot | null }>(stage: T, slot: TargetSlot): T {
  stage.targetSlot = slot;
  return stage;
}

function groupWithSlot(group: TargetGroup, target: Object3D, slot: TargetSlot): TargetGroup {
  group.memberSlots = new Map([[target, slot]]);
  return group;
}

function lookingAtOrigin(position: Vector3) {
  const state = createCameraState();
  position.toArray(state.position);
  new Quaternion()
    .setFromRotationMatrix(new Matrix4().lookAt(position, new Vector3(), new Vector3(0, 1, 0)))
    .toArray(state.quaternion);
  vec3.set(state.lookAtTarget, 0, 0, 0);
  state.hasLookAtTarget = true;
  return state;
}

const scenarios: { name: string; budget: number; frame: () => void }[] = [
  {
    name: 'KlippCore.tick, settled',
    budget: 0,
    frame: (() => {
      const core = new KlippCore();
      core.registerCamera({ id: 'cam', priority: 1, state: createCameraState() });
      core.tick(1 / 60);
      return () => void core.tick(1 / 60);
    })(),
  },
  {
    name: 'frame: Follow + HardLookAt',
    budget: 80,
    frame: klippFrame((target, c, slot) => {
      c.registerBody(withSlot(new FollowBody(target, [0, 3, 8], 0.5), slot).update);
      c.registerAim(withSlot(new HardLookAtAim(target), slot).update);
    }),
  },
  {
    name: 'frame: Follow + RotationComposer',
    budget: 488,
    frame: klippFrame((target, c, slot) => {
      c.registerBody(withSlot(new FollowBody(target, [0, 3, 12], 0.5), slot).update);
      c.registerAim(withSlot(new RotationComposerAim(target, [0, 0], 16 / 9, [0.15, 0.15], 0.5), slot).update);
    }),
  },
  {
    name: 'frame: Follow + HardLookAt + GroupFraming',
    budget: 176,
    frame: klippFrame((target, c, slot) => {
      c.registerBody(withSlot(new FollowBody(target, [0, 3, 12], 0.5), slot).update);
      c.registerAim(withSlot(new HardLookAtAim(target), slot).update);
      c.registerExtension(
        new GroupFramingExtension(
          groupWithSlot(new TargetGroup([{ target, radius: 1.5 }]), target, slot),
          40,
          1920,
          1080,
          0.5,
        ).update,
      );
    }),
  },
  {
    name: 'frame: Follow + HardLookAt + Perlin',
    budget: 319,
    frame: klippFrame((target, c, slot) => {
      c.registerBody(withSlot(new FollowBody(target, [0, 3, 12], 0.5), slot).update);
      c.registerAim(withSlot(new HardLookAtAim(target), slot).update);
      c.registerNoise(
        new BasicMultiChannelPerlinNoise(new Vector3(0.1, 0.1, 0.1), undefined, new Vector3(2, 2, 2)).update,
      );
    }),
  },
  {
    name: 'frame: two cameras, Follow + HardLookAt, shared target',
    budget: 160,
    frame: klippFrame((target, c, slot) => {
      c.registerBody(withSlot(new FollowBody(target, [0, 3, 8], 0.5), slot).update);
      c.registerAim(withSlot(new HardLookAtAim(target), slot).update);
    }, 2),
  },
  {
    name: 'TargetRegistry.refresh, two targets',
    budget: 0,
    frame: (() => {
      const registry = new TargetRegistry();
      const root = new Object3D();
      const leaf = new Object3D();
      root.add(leaf);
      registry.acquire(leaf);
      registry.acquire({ current: new Object3D() });
      return () => {
        root.position.x += 0.01;
        registry.refresh();
      };
    })(),
  },
  {
    name: 'lerpCameraState, lookAt blend in flight',
    budget: 32,
    frame: (() => {
      const a = lookingAtOrigin(new Vector3(5, 5, 5));
      const b = lookingAtOrigin(new Vector3(0, 0, 5));
      const out = createCameraState();
      const progress = { t: 0 };
      return () => {
        progress.t = (progress.t + 0.001) % 1;
        lerpCameraState(out, a, b, progress.t);
      };
    })(),
  },
];

let failed = false;
for (const { name, budget, frame } of scenarios) {
  const bytes = bytesPerFrame(frame);
  const ok = bytes <= budget + TOLERANCE;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} ${bytes.toFixed(0).padStart(5)} B/frame (budget ${budget})`);
}
process.exit(failed ? 1 : 0);
