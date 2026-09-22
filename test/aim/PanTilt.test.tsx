import { useThree } from '@react-three/fiber';
import { create } from '@react-three/test-renderer';
import { createRef } from 'react';
import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Aim } from '../../src/aim/Aim';
import type { PanTiltAim } from '../../src/aim/PanTiltAim';
import { InputController } from '../../src/input/InputController';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

function DomElementReader({ onRead }: { onRead: (el: HTMLElement) => void }) {
  onRead(useThree((state) => state.gl.domElement));
  return null;
}

describe('PanTilt (React wrapper)', () => {
  it('a nested <InputController> resolves pan/tilt from context, without an explicit target', async () => {
    let core: KlippCore | undefined;
    let domElement: HTMLElement | undefined;

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <DomElementReader onRead={(el) => (domElement = el)} />
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt>
            <InputController mouseButtons={{ left: null, right: { axes: { x: 'pan', y: 'tilt' } }, middle: null }} />
          </Aim.PanTilt>
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    const before = core!.activeState!.quaternion.clone();

    const el = domElement!;
    el.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, buttons: 2, bubbles: true, pointerType: 'mouse' }),
    );
    el.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: 0, buttons: 2, bubbles: true, pointerType: 'mouse' }),
    );
    await renderer.advanceFrames(1, 0.05);

    expect(core!.activeState!.quaternion.equals(before)).toBe(false);
  });

  it('target prop reaches the underlying PanTiltAim', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.rotation.set(0, Math.PI / 2, 0);
    target.updateMatrixWorld();

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    const forward = new Vector3(0, 0, -1).applyQuaternion(core!.activeState!.quaternion);
    const targetForward = new Vector3(0, 0, -1).applyQuaternion(target.quaternion);
    expect(forward.dot(targetForward)).toBeCloseTo(1, 4);
  });

  it("VirtualCamera's initialState.quaternion seeds pan/tilt once at mount", async () => {
    let core: KlippCore | undefined;
    const initialQuaternion = new Quaternion().setFromEuler(new Euler(0, Math.PI / 4, 0));

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} initialState={{ quaternion: initialQuaternion }}>
          <Aim.PanTilt />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(core!.activeState!.quaternion.angleTo(initialQuaternion)).toBeLessThan(1e-3);
  });

  it('damping/maxSpeed props apply to both pan and tilt', async () => {
    const aimRef = createRef<PanTiltAim>();

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt ref={aimRef} damping={0.5} maxSpeed={20} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(aimRef.current!.pan.damping).toBe(0.5);
    expect(aimRef.current!.pan.maxSpeed).toBe(20);
    expect(aimRef.current!.tilt.damping).toBe(0.5);
    expect(aimRef.current!.tilt.maxSpeed).toBe(20);
  });

  it('autoNormalize prop reaches pan.autoNormalize', async () => {
    const aimRef = createRef<PanTiltAim>();

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt ref={aimRef} autoNormalize />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(aimRef.current!.pan.autoNormalize).toBe(true);
  });

  it('panRange/tiltRange props apply to pan.range/tilt.range', async () => {
    const aimRef = createRef<PanTiltAim>();

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt ref={aimRef} panRange={[-90, 90]} tiltRange={[-45, 45]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(aimRef.current!.pan.range).toEqual([-90, 90]);
    expect(aimRef.current!.tilt.range).toEqual([-45, 45]);
  });

  it('recentering prop applies to both pan.recentering and tilt.recentering', async () => {
    const aimRef = createRef<PanTiltAim>();
    const recentering = { enabled: true, wait: 0.5, time: 0.8 };

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt ref={aimRef} recentering={recentering} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(aimRef.current!.pan.recentering).toEqual(recentering);
    expect(aimRef.current!.tilt.recentering).toEqual(recentering);
  });

  it('defaults to pan wrapping (free look-around) and tilt clamped (no flip past up/down)', async () => {
    const aimRef = createRef<PanTiltAim>();

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt ref={aimRef} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(aimRef.current!.pan.wrap).toBe(true);
    expect(aimRef.current!.tilt.wrap).toBe(false);
  });

  it('panWrap/tiltWrap props apply to pan.wrap/tilt.wrap - e.g. a restricted-arc turret', async () => {
    const aimRef = createRef<PanTiltAim>();

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Aim.PanTilt ref={aimRef} panWrap={false} tiltWrap />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(aimRef.current!.pan.wrap).toBe(false);
    expect(aimRef.current!.tilt.wrap).toBe(true);
  });
});
