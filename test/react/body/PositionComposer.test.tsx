import { create } from '@react-three/test-renderer';
import { vec3 } from 'math';
import { createRef } from 'react';
import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { KlippCore } from '../../../src/core/KlippCore';
import { PositionComposer, type PositionComposerProps } from '../../../src/react/body/PositionComposer';
import { Klipp } from '../../../src/react/Klipp';
import { useKlipp } from '../../../src/react/KlippContext';
import { VirtualCamera } from '../../../src/react/VirtualCamera';
import type { PositionComposerBody } from '../../../src/three/body/PositionComposerBody';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlipp().core);
  return null;
}

describe('PositionComposer', () => {
  it('registers a body that runs every frame', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(0, 0, -20);

    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <PositionComposer target={target} cameraDistance={10} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position[2]).toBeCloseTo(-10, 5);
  });

  it('passes every prop to the same body, on mount and when props change', async () => {
    const ref = createRef<PositionComposerBody>();
    const first: PositionComposerProps = {
      target: new Object3D(),
      cameraDistance: 8,
      screenPosition: [0.1, 0.2],
      deadZone: [0.3, 0.3],
      damping: 0.4,
      maxSpeed: 5,
      hardLimit: [0.6, 0.6],
      radius: 1,
      size: [1, 2, 3],
      depthDeadZone: 2,
      lookaheadTime: 0.5,
      lookaheadSmoothing: 3,
      lookaheadIgnoreY: true,
    };
    const second: PositionComposerProps = {
      target: new Object3D(),
      cameraDistance: 12,
      screenPosition: [-0.1, 0],
      deadZone: [0.1, 0.2],
      damping: { into: 0.2, from: 1 },
      maxSpeed: 9,
      hardLimit: [0.8, 0.7],
      radius: 2,
      size: [4, 5, 6],
      depthDeadZone: 1,
      lookaheadTime: 0.2,
      lookaheadSmoothing: 1,
      lookaheadIgnoreY: false,
    };
    const scene = (props: PositionComposerProps) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <PositionComposer ref={ref} {...props} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(first));
    const body = ref.current!;
    expect(body).toMatchObject(first);

    await renderer.update(scene(second));
    expect(ref.current).toBe(body);
    expect(body).toMatchObject(second);
  });

  it('stops moving the camera once unmounted', async () => {
    let core: KlippCore | undefined;
    // a fixed point is read every frame, so a body left registered would follow the edit below
    const target: [number, number, number] = [0, 0, -20];
    const scene = (mounted: boolean) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          {mounted && <PositionComposer target={target} cameraDistance={10} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);
    await renderer.update(scene(false));
    const before = vec3.clone(core!.activeState!.position);

    target[0] = 30;
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position).toEqual(before);
  });

  it("eases in from VirtualCamera's initialState.position instead of snapping", async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(0, 0, -20);

    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} initialState={{ position: [0, 0, 100] }}>
          <PositionComposer target={target} cameraDistance={10} damping={0.5} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.016);

    expect(core!.activeState!.position[2]).toBeLessThan(100);
    expect(core!.activeState!.position[2]).toBeGreaterThan(-10);
  });
});
