import { afterEach, describe, expect, it } from 'vitest';
import { InputAxis } from '../../src/input/InputAxis';
import { InputAxisController, type InputAxisControllerConfig } from '../../src/input/InputAxisController';

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
  el.dispatchEvent(
    new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }),
  );
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

  it('right-drag feeds the mapped axis pair', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 4, 2);
    controller.update();

    expect(x.value).toBeCloseTo(10, 5);
    expect(y.value).toBeCloseTo(4, 5);
  });

  it('an unmapped source (null) is ignored entirely', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: { axes: { x, y } }, right: null, middle: null } });

    pointer(el, 'pointerdown', 0, 0, 2); // right button - unmapped
    pointer(el, 'pointermove', 999, 999, 2);
    controller.update();

    expect(x.value).toBe(0);
    expect(y.value).toBe(0);
  });

  it('gain scales the delta before it reaches the axes', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y }, gain: 0.5 }, middle: null } });

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 4, 2);
    controller.update();

    expect(x.value).toBeCloseTo(5, 5);
    expect(y.value).toBeCloseTo(2, 5);
  });

  it('invert: true flips both axes', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({
      ...emptyConfig(),
      mouseButtons: { left: null, right: { axes: { x, y }, invert: true }, middle: null },
    });

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 4, 2);
    controller.update();

    expect(x.value).toBeCloseTo(-10, 5);
    expect(y.value).toBeCloseTo(-4, 5);
  });

  it('invert: {y: true} flips only the y axis, e.g. an "invert Y look" toggle', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({
      ...emptyConfig(),
      mouseButtons: { left: null, right: { axes: { x, y }, invert: { y: true } }, middle: null },
    });

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 4, 2);
    controller.update();

    expect(x.value).toBeCloseTo(10, 5);
    expect(y.value).toBeCloseTo(-4, 5);
  });

  it('gain and invert compose (invert applies to the already-scaled delta)', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({
      ...emptyConfig(),
      mouseButtons: { left: null, right: { axes: { x, y }, gain: 2, invert: true }, middle: null },
    });

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 0, 2);
    controller.update();

    expect(x.value).toBeCloseTo(-20, 5);
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

    expect(x.value).toBeCloseTo(13, 5); // 10 (right-drag) + 3 (touch)
  });

  it('update() with no input this frame is a harmless no-op', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });

    expect(() => controller.update()).not.toThrow();
    expect(x.value).toBe(0);
    expect(y.value).toBe(0);
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

  it('enabled = false: still connected and listening, but drained deltas never reach the axes', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });
    controller.enabled = false;

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 10, 4, 2);
    controller.update();

    expect(x.value).toBe(0);
    expect(y.value).toBe(0);
  });

  it('enabled = false does not queue input for a catch-up jump on re-enable - it drains and discards', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });
    controller.enabled = false;

    pointer(el, 'pointerdown', 0, 0, 2);
    pointer(el, 'pointermove', 999, 999, 2);
    controller.update(); // drained and discarded while disabled

    controller.enabled = true;
    pointer(el, 'pointermove', 1005, 1003, 2);
    controller.update();

    expect(x.value).toBeCloseTo(6, 5); // only the movement since re-enabling
    expect(y.value).toBeCloseTo(4, 5);
  });

  it("buttonless movement while Pointer Lock is active reuses mouseButtons.left's own mapping", () => {
    const x = new InputAxis();
    const y = new InputAxis();
    const el = setup({
      ...emptyConfig(),
      mouseButtons: { left: { axes: { x, y }, gain: 2, invert: true }, right: null, middle: null },
    });
    stubPointerLock(el);
    controller.inputSystem.requestPointerLock();

    el.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        movementX: 10,
        movementY: 4,
        buttons: 0,
        bubbles: true,
        pointerType: 'mouse',
      }),
    );
    controller.update();

    expect(x.value).toBeCloseTo(-20, 5); // same gain/invert as mouseButtons.left
    expect(y.value).toBeCloseTo(-8, 5);
  });

  it('left unmapped: buttonless Pointer Lock movement does nothing either', () => {
    const el = setup({ ...emptyConfig(), mouseButtons: { left: null, right: null, middle: null } });
    stubPointerLock(el);
    controller.inputSystem.requestPointerLock();

    el.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        movementX: 10,
        movementY: 4,
        buttons: 0,
        bubbles: true,
        pointerType: 'mouse',
      }),
    );

    expect(() => controller.update()).not.toThrow();
  });

  it('exposes its own InputSystem for direct configuration (e.g. interactiveArea, lockTouchAxis)', () => {
    const x = new InputAxis();
    const y = new InputAxis();
    setup({ ...emptyConfig(), mouseButtons: { left: null, right: { axes: { x, y } }, middle: null } });

    expect(controller.inputSystem).toBeInstanceOf(Object);
    controller.inputSystem.lockTouchAxis = true;
    expect(controller.inputSystem.lockTouchAxis).toBe(true);
  });
});
