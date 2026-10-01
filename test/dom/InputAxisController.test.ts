import { afterEach, describe, expect, it } from 'vitest';
import { InputAxis } from '../../src/core/input/InputAxis';
import { InputAxisController, type InputAxisControllerConfig } from '../../src/dom/InputAxisController';

function pointer(el: HTMLElement, type: string, x: number, y: number, buttons: number, pointerId = 1): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      clientX: x,
      clientY: y,
      buttons,
      bubbles: true,
      pointerType: 'mouse',
      isPrimary: true,
    }),
  );
}

function touch(el: HTMLElement, type: string, x: number, y: number, pointerId = 1): void {
  el.dispatchEvent(new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
}

// InputAxisController.update() only calls applyDelta() on the mapped axes - it's up to the axis owner
// (e.g. PanTiltAim) to call axis.update(dt) afterward. damping=0 (default) converges near-instantly but
// still needs a couple of real update() ticks to settle exactly, same as InputAxis's own tests.
function settle(...axes: InputAxis[]): void {
  for (let i = 0; i < 3; i++) for (const axis of axes) axis.update(0.016);
}

function emptyConfig(): InputAxisControllerConfig {
  return {
    mouseButtons: { left: null, right: null, middle: null },
    touches: { one: null, two: null, three: null },
  };
}

// jsdom doesn't implement the Pointer Lock API at all - polyfill just enough of it to exercise
// InputSystem's buttonless-while-locked handling against real event dispatch.
function stubPointerLock(el: HTMLElement): void {
  Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  el.requestPointerLock = (() => {
    Object.defineProperty(document, 'pointerLockElement', { value: el, configurable: true });
  }) as unknown as HTMLElement['requestPointerLock'];
  document.exitPointerLock = () => {
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  };
}

describe('InputAxisController', () => {
  let element: HTMLElement;
  let controller: InputAxisController;

  afterEach(() => {
    controller?.disconnect();
    element?.remove();
  });

  function setup(config: InputAxisControllerConfig): HTMLElement {
    element = document.createElement('div');
    document.body.appendChild(element);
    element.setPointerCapture = () => {};
    element.releasePointerCapture = () => {};
    controller = new InputAxisController(config);
    controller.connect(element);
    return element;
  }

  it('feeds a mapped source into its axes and ignores unmapped ones', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });

    pointer(el, 'pointerdown', 0, 0, 1); // left - unmapped
    pointer(el, 'pointermove', 999, 999, 1);
    pointer(el, 'pointerup', 999, 999, 0);
    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 4, 2);
    controller.update();
    settle(x, y);

    expect([x.value, y.value]).toEqual([10, 4]);
  });

  it('scales by gain and flips inverted axes', () => {
    const feed = (mapping: { gain?: number; invert?: boolean | { x?: boolean; y?: boolean } }) => {
      const x = new InputAxis();
      const y = new InputAxis();
      const el = setup({
        ...emptyConfig(),
        mouseButtons: { left: null, right: { axes: { x, y }, ...mapping }, middle: null },
      });
      pointer(el, 'pointerdown', 0, 0, 2);
      pointer(el, 'pointermove', 10, 4, 2);
      controller.update();
      controller.disconnect();
      settle(x, y);
      return [x.value, y.value];
    };

    expect(feed({ gain: 0.5 })).toEqual([5, 2]);
    expect(feed({ invert: true })).toEqual([-10, -4]);
    expect(feed({ invert: { y: true } })).toEqual([10, -4]);
    expect(feed({ gain: 2, invert: true })).toEqual([-20, -8]);
  });

  it('two different sources mapped to the same axis pair both contribute, summed', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({
      mouseButtons: { left: null, right: { axes: { x, y } }, middle: null },
      touches: { one: { axes: { x, y } }, two: null, three: null },
    });

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 0, 2);
    touch(el, 'pointerdown', 0, 0, 5);
    touch(el, 'pointermove', 3, 0, 5);
    controller.update();
    settle(x, y);

    expect(x.value).toBeCloseTo(13, 5); // 10 (right-drag) + 3 (touch)
  });

  it('disconnect() stops feeding the axes', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });
    controller.disconnect();

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 4, 2);
    controller.update();

    expect(x.value).toBe(0);
  });

  it('while disabled, drops input and holds instead of saving them for later', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });
    controller.enabled = false;

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 999, 999, 2);
    controller.update();
    expect([x.value, y.value, x.held]).toEqual([0, 0, false]);

    controller.enabled = true;
    pointer(el, 'pointermove', 1005, 1003, 2);
    controller.update();
    settle(x, y);
    expect([x.value, y.value]).toEqual([6, 4]);
  });

  it("feeds buttonless movement under Pointer Lock through mouseButtons.left's mapping", () => {
    const lockedMove = (left: InputAxisControllerConfig['mouseButtons']['left']) => {
      const el = setup({ ...emptyConfig(), mouseButtons: { left, right: null, middle: null } });
      stubPointerLock(el);
      controller.inputSystem.requestPointerLock();
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          movementX: 10,
          movementY: 4,
          buttons: 0,
          bubbles: true,
          pointerType: 'mouse',
        }),
      );
      controller.update();
      controller.disconnect();
    };

    const x = new InputAxis();
    const y = new InputAxis();
    lockedMove({ axes: { x, y }, gain: 2, invert: true });
    settle(x, y);
    expect([x.value, y.value]).toEqual([-20, -8]);

    expect(() => lockedMove(null)).not.toThrow();
  });

  describe('held propagation', () => {
    it('marks the mapped axes held while their source is pressed', () => {
      const x = new InputAxis();
      const y = new InputAxis();
      const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });

      pointer(el, 'pointerdown', 0, 0, 1); // left - unmapped
      controller.update();
      expect(x.held).toBe(false);
      pointer(el, 'pointerup', 0, 0, 0);

      pointer(el, 'pointerdown', 0, 0, 2);
      controller.update();
      expect([x.held, y.held]).toEqual([true, true]);

      pointer(el, 'pointerup', 0, 0, 0);
      controller.update();
      expect([x.held, y.held]).toEqual([false, false]);
    });

    it('two sources sharing one axis pair OR together - one releasing does not clear it while the other still holds', () => {
      const x = new InputAxis();
      const y = new InputAxis();
      const el = setup({
        mouseButtons: { left: null, right: { axes: { x, y } }, middle: null },
        touches: { one: { axes: { x, y } }, two: null, three: null },
      });

      pointer(el, 'pointerdown', 0, 0, 2);
      touch(el, 'pointerdown', 0, 0, 5);
      controller.update();
      expect(x.held).toBe(true);

      pointer(el, 'pointerup', 0, 0, 0); // mouse released, touch still down
      controller.update();
      expect(x.held).toBe(true); // still held via touch
      expect(y.held).toBe(true);
    });
  });
});
