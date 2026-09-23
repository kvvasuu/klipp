import { useThree } from '@react-three/fiber';
import { create } from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { HardLockToTarget } from '../../src/body/HardLockToTarget';
import { InputAxis } from '../../src/input/InputAxis';
import type { InputAxisController } from '../../src/input/InputAxisController';
import { InputController } from '../../src/input/InputController';
import { InputAxisOwnerContext, type InputAxisOwner } from '../../src/input/InputAxisOwnerContext';
import { Klipp } from '../../src/Klipp';
import { VirtualCamera } from '../../src/VirtualCamera';

function DomElementReader({ onRead }: { onRead: (el: HTMLElement) => void }) {
  onRead(useThree((state) => state.gl.domElement));
  return null;
}

function owner(axes: Record<string, InputAxis>): { current: InputAxisOwner | null } {
  return { current: { inputAxes: axes } };
}

describe('InputController (React wrapper)', () => {
  it("resolves the target's named inputAxes into the underlying InputAxisController's config", async () => {
    const pan = new InputAxis();
    const tilt = new InputAxis();
    const target = owner({ pan, tilt });
    let controller: InputAxisController | null = null;

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            mouseButtons={{ left: null, right: { axes: { x: 'pan', y: 'tilt' } }, middle: null }}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(controller!.config.mouseButtons.right?.axes.x).toBe(pan);
    expect(controller!.config.mouseButtons.right?.axes.y).toBe(tilt);
    expect(controller!.config.mouseButtons.left).toBeNull();
  });

  it('with no target prop, resolves inputAxes from the nearest InputAxisOwnerContext instead', async () => {
    const pan = new InputAxis();
    const tilt = new InputAxis();
    let controller: InputAxisController | null = null;

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputAxisOwnerContext.Provider value={{ inputAxes: { pan, tilt } }}>
            <InputController
              ref={(c) => (controller = c)}
              mouseButtons={{ left: null, right: { axes: { x: 'pan', y: 'tilt' } }, middle: null }}
            />
          </InputAxisOwnerContext.Provider>
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(controller!.config.mouseButtons.right?.axes.x).toBe(pan);
    expect(controller!.config.mouseButtons.right?.axes.y).toBe(tilt);
  });

  it('an explicit target prop overrides an ambient InputAxisOwnerContext', async () => {
    const contextPan = new InputAxis();
    const contextTilt = new InputAxis();
    const explicitPan = new InputAxis();
    const explicitTilt = new InputAxis();
    const target = owner({ pan: explicitPan, tilt: explicitTilt });
    let controller: InputAxisController | null = null;

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputAxisOwnerContext.Provider value={{ inputAxes: { pan: contextPan, tilt: contextTilt } }}>
            <InputController
              ref={(c) => (controller = c)}
              target={target}
              mouseButtons={{ left: null, right: { axes: { x: 'pan', y: 'tilt' } }, middle: null }}
            />
          </InputAxisOwnerContext.Provider>
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(controller!.config.mouseButtons.right?.axes.x).toBe(explicitPan);
    expect(controller!.config.mouseButtons.right?.axes.y).toBe(explicitTilt);
  });

  it('a source with no axis name of that kind on the target resolves to null, with a dev warning', async () => {
    const target = owner({ pan: new InputAxis(), tilt: new InputAxis() });
    let controller: InputAxisController | null = null;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            mouseButtons={{ left: null, right: { axes: { x: 'pan', y: 'nonexistent' } }, middle: null }}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(controller!.config.mouseButtons.right).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
    warnSpy.mockRestore();
  });

  it('a prop change (new axis names) is picked up on the next frame', async () => {
    const pan = new InputAxis();
    const tilt = new InputAxis();
    const radial = new InputAxis();
    const target = owner({ pan, tilt, radial });
    let controller: InputAxisController | null = null;

    const scene = (axisName: string) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            mouseButtons={{ left: null, right: { axes: { x: 'pan', y: axisName } }, middle: null }}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene('tilt'));
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.config.mouseButtons.right?.axes.y).toBe(tilt);

    await renderer.update(scene('radial'));
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.config.mouseButtons.right?.axes.y).toBe(radial);
  });

  it('connecting/disconnecting on mount/unmount does not throw in the test renderer', async () => {
    const target = owner({ pan: new InputAxis(), tilt: new InputAxis() });

    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && (
            <InputController
              target={target}
              mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
            />
          )}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.05);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.05)).resolves.not.toThrow();
  });

  it('waitForBlend=true (default): does not connect until the blend into it actually finishes', async () => {
    const target = owner({ pan: new InputAxis(), tilt: new InputAxis() });
    let controller: InputAxisController | null = null;

    const scene = (orbitalPriority: number) => (
      <Klipp>
        <VirtualCamera name="orbital" priority={orbitalPriority}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
          />
        </VirtualCamera>
        <VirtualCamera name="other" priority={5}>
          <HardLockToTarget target={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.05); // 'other' snaps live instantly (first-ever, no blend)

    const connectSpy = vi.spyOn(controller!, 'connect');

    await renderer.update(scene(10)); // orbital wins priority - blend into it starts (default 2s)
    await renderer.advanceFrames(1, 0.5); // mid-blend: not live yet
    expect(connectSpy).not.toHaveBeenCalled();

    await renderer.advanceFrames(1, 2); // pushes elapsed well past the 2s blend duration
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('waitForBlend=false: connects the instant it wins priority, even mid-blend', async () => {
    const target = owner({ pan: new InputAxis(), tilt: new InputAxis() });
    let controller: InputAxisController | null = null;

    const scene = (orbitalPriority: number) => (
      <Klipp>
        <VirtualCamera name="orbital" priority={orbitalPriority}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            waitForBlend={false}
            mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
          />
        </VirtualCamera>
        <VirtualCamera name="other" priority={5}>
          <HardLockToTarget target={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.05);

    const connectSpy = vi.spyOn(controller!, 'connect');

    await renderer.update(scene(10));
    await renderer.advanceFrames(1, 0.05); // still mid-blend, but waitForBlend=false doesn't care
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('suppressContextMenu/interactiveArea/lockTouchAxis are applied to the underlying InputSystem declaratively', async () => {
    const target = owner({ pan: new InputAxis(), tilt: new InputAxis() });
    let controller: InputAxisController | null = null;
    const area = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
            suppressContextMenu
            interactiveArea={area}
            lockTouchAxis
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(controller!.inputSystem.suppressContextMenu).toBe(true);
    expect(controller!.inputSystem.interactiveArea).toBe(area);
    expect(controller!.inputSystem.lockTouchAxis).toBe(true);
  });

  it('enabled defaults to true and is reactive to the prop', async () => {
    const target = owner({ pan: new InputAxis(), tilt: new InputAxis() });
    let controller: InputAxisController | null = null;

    const scene = (enabled: boolean | undefined) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
            enabled={enabled}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(undefined));
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.enabled).toBe(true);

    await renderer.update(scene(false));
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.enabled).toBe(false);

    await renderer.update(scene(true));
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.enabled).toBe(true);
  });

  it('enabled=false does not affect connect/disconnect - InputSystem still listens, drained deltas just never reach the axes', async () => {
    const pan = new InputAxis();
    const tilt = new InputAxis();
    const target = owner({ pan, tilt });
    let controller: InputAxisController | null = null;
    let domElement: HTMLElement | undefined;

    const scene = (
      <Klipp>
        <DomElementReader onRead={(el) => (domElement = el)} />
        <VirtualCamera name="a" priority={10}>
          <InputController
            ref={(c) => (controller = c)}
            target={target}
            mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
            enabled={false}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    const el = domElement!;
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        buttons: 1,
        bubbles: true,
        pointerType: 'mouse',
      }),
    );
    el.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 20,
        clientY: 0,
        buttons: 1,
        bubbles: true,
        pointerType: 'mouse',
      }),
    );
    await renderer.advanceFrames(1, 0.05);

    // proves InputSystem actually received/buffered the event (connect() ran) - if it hadn't connected
    // at all, lastInput would show 0 too, same as pan.value, and this test wouldn't tell them apart
    expect(controller!.lastInput.leftDx).toBeCloseTo(20, 5);
    expect(pan.value).toBe(0); // ...but enabled=false kept it from ever reaching the axis
  });
});
