/**
 * Deterministic world for golden trajectory tests: a nested, moving, rotating target (with a
 * teleport), two extra group members, an orbiting camera path for aims, and an irregular dt.
 * Do not change anything here after fixtures are recorded: fixtures depend on every number.
 */
import { vec3 } from 'math';
import { Object3D } from 'three';
import type { CameraState } from '../../src/CameraState';

export const FRAMES = 240;
export const SAMPLE_EVERY = 4;
export const TELEPORT_FRAME = 150;

const DT_PATTERN = [1 / 60, 1 / 60, 1 / 60, 1 / 30, 1 / 60, 1 / 144, 1 / 60, 1 / 90];
export const dtAt = (frame: number): number => DT_PATTERN[frame % DT_PATTERN.length];

export type World = ReturnType<typeof createWorld>;

export function createWorld() {
  // target sits two levels deep, so world-space resolution is exercised
  const root = new Object3D();
  const middle = new Object3D();
  const target = new Object3D();
  root.add(middle);
  middle.add(target);
  middle.position.set(0, 1, 0);
  middle.rotation.set(0.1, 0, 0);
  target.position.set(0.5, 0, 0);

  const memberA = new Object3D();
  const memberB = new Object3D();
  const clock = { time: 0 };

  return {
    target,
    memberA,
    memberB,
    clock,
    step(frame: number, dt: number): void {
      clock.time += dt;
      const t = clock.time;
      const jump = frame >= TELEPORT_FRAME ? 12 : 0;
      root.position.set(Math.sin(t) * 8 + jump, Math.sin(t * 2.3) * 0.5, Math.cos(t) * 8);
      root.rotation.set(0, t * 0.8, Math.sin(t * 1.7) * 0.2);
      memberA.position.set(root.position.x + 3, 0.5, root.position.z - 2 * Math.cos(t));
      memberB.position.set(root.position.x - 4 * Math.sin(t * 0.7), 1, root.position.z + 3);
      root.updateMatrixWorld(true);
      memberA.updateMatrixWorld(true);
      memberB.updateMatrixWorld(true);
    },
  };
}

/** Camera path used by aim-only scenarios, so aims are tested independently of bodies. */
export function orbitCamera(state: CameraState, time: number): void {
  vec3.set(state.position, Math.sin(time * 0.5) * 15, 4 + Math.sin(time), Math.cos(time * 0.5) * 15);
}

export const COLUMNS = ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'fov', 'near', 'far'] as const;

/** The observable output of a frame. Keep in sync with COLUMNS. */
export function sample(state: CameraState): number[] {
  const { position: p, quaternion: q } = state;
  return [p[0], p[1], p[2], q[0], q[1], q[2], q[3], state.fov, state.near, state.far];
}

/** Runs FRAMES frames and collects a sample every SAMPLE_EVERY frames plus the last one. */
export function simulate(build: (world: World) => (dt: number, frame: number) => CameraState): number[][] {
  const world = createWorld();
  const frameFn = build(world);
  const samples: number[][] = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    const dt = dtAt(frame);
    world.step(frame, dt);
    const state = frameFn(dt, frame);
    if (frame % SAMPLE_EVERY === 0 || frame === FRAMES - 1) samples.push(sample(state));
  }
  return samples;
}
