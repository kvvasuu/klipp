import { vec3 } from 'math';
import { BoxGeometry, Mesh, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../src/CameraState';
import { HardLookAtAim } from '../../src/aim/HardLookAtAim';
import { PanTiltAim } from '../../src/aim/PanTiltAim';
import { RotateWithFollowTargetAim } from '../../src/aim/RotateWithFollowTargetAim';
import { RotationComposerAim } from '../../src/aim/RotationComposerAim';
import { BindingModes } from '../../src/body/BindingModes';
import { FollowBody } from '../../src/body/FollowBody';
import { HardLockToTargetBody } from '../../src/body/HardLockToTargetBody';
import { PositionComposerBody } from '../../src/body/PositionComposerBody';
import { GroupFramingExtension } from '../../src/extension/GroupFramingExtension';
import { TargetGroup } from '../../src/extension/TargetGroup';
import { TargetRegistry, type TargetSlot } from '../../src/resolve/TargetRegistry';
import { createWorld, dtAt, orbitCamera, type World } from '../golden/world';

type Update = (out: CameraState, dt: number, justActivated: boolean) => unknown;
type Stage = { update: Update; useSlots: (slotOf: (target: Object3D) => TargetSlot) => void };

/** A world with a scaled box mesh under the moving target, so size and world-scale paths run too. */
function worldWithMesh(): World & { mesh: Mesh } {
  const world = createWorld();
  const mesh = new Mesh(new BoxGeometry(1, 2, 0.5));
  mesh.position.set(0.3, 0, 0);
  mesh.scale.set(2, 1, 1.5);
  world.target.add(mesh);
  return Object.assign(world, { mesh });
}

/** Runs the same stages without and with registry slots and returns both output histories. */
function runBothWays(makeStages: (world: World & { mesh: Mesh }) => Stage[], orbit = false) {
  const histories: number[][][] = [];
  for (const withSlots of [false, true]) {
    const world = worldWithMesh();
    const registry = new TargetRegistry();
    const stages = makeStages(world);
    if (withSlots) for (const stage of stages) stage.useSlots((target) => registry.acquire(target));
    const state = createCameraState();
    vec3.set(state.position, 0, 2, 15);
    const history: number[][] = [];
    for (let frame = 0; frame < 200; frame++) {
      const dt = dtAt(frame);
      world.step(frame, dt);
      registry.refresh();
      if (orbit) orbitCamera(state, world.clock.time);
      for (const stage of stages) stage.update(state, dt, frame === 0);
      history.push([...state.position, ...state.quaternion, state.fov, ...state.target, ...state.lookAtTarget]);
    }
    histories.push(history);
  }
  return histories;
}

const single = <T extends { update: Update; target: unknown; targetSlot: TargetSlot | null }>(stage: T): Stage => ({
  update: stage.update,
  useSlots: (slotOf) => (stage.targetSlot = slotOf(stage.target as Object3D)),
});

describe('stages read the same values from registry slots as from the scene graph', () => {
  for (const mode of Object.values(BindingModes)) {
    it(`Follow (${mode}) + HardLookAt`, () => {
      const [direct, slotted] = runBothWays((w) => [
        single(new FollowBody(w.target, new Vector3(0, 3, 8), 0.4, mode)),
        single(new HardLookAtAim(w.target)),
      ]);
      expect(slotted).toEqual(direct);
    });
  }

  it('PositionComposer with lookahead and a geometry-sized target', () => {
    const [direct, slotted] = runBothWays((w) => [
      single(
        new PositionComposerBody(
          w.mesh,
          10,
          [0.1, 0],
          16 / 9,
          [0.1, 0.1],
          0.3,
          [0.4, 0.4],
          undefined,
          undefined,
          1,
          0.5,
        ),
      ),
      single(new RotationComposerAim(w.mesh, [0.1, -0.1], 16 / 9, [0.1, 0.1], 0.3, [0.4, 0.4])),
    ]);
    expect(slotted).toEqual(direct);
  });

  it('HardLockToTarget + RotateWithFollowTarget', () => {
    const [direct, slotted] = runBothWays((w) => [
      single(new HardLockToTargetBody(w.target, 0.3)),
      single(new RotateWithFollowTargetAim(w.target, 0.3)),
    ]);
    expect(slotted).toEqual(direct);
  });

  it('PanTilt relative to the target', () => {
    const [direct, slotted] = runBothWays((w) => {
      const panTilt = new PanTiltAim();
      panTilt.target = w.target;
      return [single(panTilt)];
    }, true);
    expect(slotted).toEqual(direct);
  });

  it('GroupFraming with a sized member', () => {
    const [direct, slotted] = runBothWays((w) => {
      const group = new TargetGroup([
        { target: w.target, radius: 1 },
        { target: w.memberA, radius: 0.5 },
        { target: w.mesh },
      ]);
      const extension = new GroupFramingExtension(group, 0.1, 1920, 1080, 0.3);
      return [
        single(new HardLookAtAim(w.target)),
        {
          update: extension.update,
          useSlots: (slotOf) =>
            (group.memberSlots = new Map(
              group.members.map((member) => [member.target, slotOf(member.target as Object3D)]),
            )),
        },
      ];
    });
    expect(slotted).toEqual(direct);
  });
});
