import { useThree } from '@react-three/fiber';
import { create } from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { HardLockToTarget } from '../../../src/react/body/HardLockToTarget';
import { InputAxis } from '../../../src/core/input/InputAxis';
import type { InputAxisController } from '../../../src/dom/InputAxisController';
import { InputController } from '../../../src/react/input/InputController';
import { InputAxisOwnerContext, type InputAxisOwner } from '../../../src/react/input/InputAxisOwnerContext';
import { Klipp } from '../../../src/react/Klipp';
import { VirtualCamera } from '../../../src/react/VirtualCamera';

function DomElementReader({ onRead }: { onRead: (el: HTMLElement) => void }) {
  onRead(useThree((state) => state.gl.domElement));
  return null;
}

function owner(axes: Record<string, InputAxis>): { current: InputAxisOwner | null } {
  return { current: { inputAxes: axes } };
}

describe('InputController (React wrapper)', () => {
  it('resolves axis names on the target, over any owner context, and follows name changes', async () => {
    const pan = new InputAxis();
    const tilt = new InputAxis();
    const radial = new InputAxis();
    let controller: InputAxisController | null = null;
    const scene = (y: string) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputAxisOwnerContext.Provider value={{ inputAxes: { pan: new InputAxis(), tilt: new InputAxis() } }}>
            <InputController
              ref={(c) => (controller = c)}
              target={owner({ pan, tilt, radial })}
              mouseButtons={{ left: null, right: { axes: { x: 'pan', y } }, middle: null }}
            />
          </InputAxisOwnerContext.Provider>
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene('tilt'));
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.config.mouseButtons.right?.axes).toEqual({ x: pan, y: tilt });
    expect(controller!.config.mouseButtons.left).toBeNull();

    await renderer.update(scene('radial'));
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.config.mouseButtons.right?.axes.y).toBe(radial);
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

  it('disconnects when unmounted', async () => {
    let controller: InputAxisController | null = null;
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && (
            <InputController
              ref={(c) => {
                if (c) controller = c;
              }}
              target={owner({ pan: new InputAxis(), tilt: new InputAxis() })}
              mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
            />
          )}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.05);
    const disconnect = vi.spyOn(controller!, 'disconnect');

    await renderer.update(scene(false));

    expect(disconnect).toHaveBeenCalled();
  });

  it('connects once the blend into its camera finishes, or right away with waitForBlend off', async () => {
    const connectsAt = async (waitForBlend?: boolean) => {
      let controller: InputAxisController | null = null;
      const scene = (priority: number) => (
        <Klipp>
          <VirtualCamera name="orbital" priority={priority}>
            <InputController
              ref={(c) => (controller = c)}
              target={owner({ pan: new InputAxis(), tilt: new InputAxis() })}
              waitForBlend={waitForBlend}
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
      const connect = vi.spyOn(controller!, 'connect');

      await renderer.update(scene(10)); // a 2 s blend into it starts
      await renderer.advanceFrames(1, 0.5);
      const midBlend = connect.mock.calls.length;
      await renderer.advanceFrames(1, 2);
      return [midBlend, connect.mock.calls.length];
    };

    expect(await connectsAt()).toEqual([0, 1]);
    expect(await connectsAt(false)).toEqual([1, 1]);
  });

  it('passes its options to the controller and its InputSystem, enabled by default', async () => {
    let controller: InputAxisController | null = null;
    const area = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const scene = (enabled?: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <InputController
            ref={(c) => (controller = c)}
            target={owner({ pan: new InputAxis(), tilt: new InputAxis() })}
            mouseButtons={{ left: { axes: { x: 'pan', y: 'tilt' } }, right: null, middle: null }}
            suppressContextMenu
            interactiveArea={area}
            lockTouchAxis
            enabled={enabled}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene());
    await renderer.advanceFrames(1, 0.05);
    expect(controller!.enabled).toBe(true);
    expect(controller!.inputSystem).toMatchObject({
      suppressContextMenu: true,
      interactiveArea: area,
      lockTouchAxis: true,
    });

    await renderer.update(scene(false));
    expect(controller!.enabled).toBe(false);
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
