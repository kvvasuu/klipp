import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConsumedInput, type ConsumedInput } from '../../src/core/input/consumedInput';
import { InputSystem, MouseButton } from '../../src/dom/InputSystem';

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

// jsdom has no GestureEvent constructor - Safari's own scale/rotation are just plain properties, not
// part of any standard Event interface, so a bare Event dressed up with them dispatches identically.
function gesture(el: HTMLElement, type: string, scale: number, rotation: number, x = 0, y = 0): void {
  el.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      scale,
      rotation,
      clientX: x,
      clientY: y,
    }),
  );
}

// jsdom doesn't implement the Pointer Lock API at all - polyfill just enough of it to exercise
// InputSystem's request/exit/pointerlockchange handling against real event dispatch.
function stubPointerLock(el: HTMLElement): void {
  Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  el.requestPointerLock = (() => {
    Object.defineProperty(document, 'pointerLockElement', { value: el, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
  }) as unknown as HTMLElement['requestPointerLock'];
  document.exitPointerLock = () => {
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
  };
}

function emptyInput(): ConsumedInput {
  return createConsumedInput();
}

describe('InputSystem', () => {
  let element: HTMLElement;
  let system: InputSystem;

  afterEach(() => {
    system?.disconnect();
    element?.remove();
  });

  function setup(): HTMLElement {
    element = document.createElement('div');
    document.body.appendChild(element);
    element.setPointerCapture = () => {}; // jsdom doesn't implement Pointer Capture
    element.releasePointerCapture = () => {};
    stubPointerLock(element);
    // jsdom's real getBoundingClientRect() is all zeros - stub a real-ish rect for interactiveArea math
    element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }) as DOMRect;
    system = new InputSystem();
    system.connect(element);
    return element;
  }

  it('buffers left-drag deltas across a pointer sequence, consume() drains and zeroes the buffer', () => {
    const el = setup();

    pointer(el, 'pointerdown', 0, 0, MouseButton.left);
    pointer(el, 'pointermove', 10, 4, MouseButton.left);
    pointer(el, 'pointermove', 25, 10, MouseButton.left);
    pointer(el, 'pointerup', 25, 10, 0);

    const out = emptyInput();
    system.consume(out);

    expect(out.leftDx).toBeCloseTo(25, 5);
    expect(out.leftDy).toBeCloseTo(10, 5);
    expect(out.rightDx).toBe(0);

    // draining again with no new events in between must come back to zero
    system.consume(out);
    expect(out.leftDx).toBe(0);
  });

  it('routes each held button into its own bucket, both at once when both are held', () => {
    const el = setup();
    const both = MouseButton.left | MouseButton.right;

    pointer(el, 'pointerdown', 0, 0, both);
    pointer(el, 'pointermove', 10, 0, both);
    pointer(el, 'pointerup', 10, 0, 0);
    pointer(el, 'pointerdown', 0, 0, MouseButton.right);
    pointer(el, 'pointermove', 5, 5, MouseButton.right);

    const out = emptyInput();
    system.consume(out);

    expect(out.leftDx).toBeCloseTo(10, 5);
    expect(out.rightDx).toBeCloseTo(15, 5);
    expect(out.rightDy).toBeCloseTo(5, 5);
  });

  it('buffers wheel deltaX and deltaY, turning a shifted single-axis wheel sideways', () => {
    const wheel = (init: WheelEventInit) => {
      const el = setup();
      el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, ...init }));
      const out = emptyInput();
      system.consume(out);
      system.disconnect();
      return [out.wheelDeltaX, out.wheelDeltaY];
    };

    expect(wheel({ deltaX: 30, deltaY: 100 })).toEqual([30, 100]);
    expect(wheel({ deltaY: 40, shiftKey: true })).toEqual([40, 0]);
    expect(wheel({ deltaX: 15, deltaY: 40, shiftKey: true })).toEqual([15, 40]); // a trackpad's own deltaX wins
  });

  it('a ctrlKey wheel event (trackpad pinch) routes into wheelZoomDelta, not wheelDeltaX/Y', () => {
    const el = setup();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 5, deltaY: 50, ctrlKey: true, bubbles: true }));

    const out = emptyInput();
    system.consume(out);
    expect(out.wheelZoomDelta).toBeCloseTo(50, 5);
    expect(out.wheelDeltaX).toBe(0);
    expect(out.wheelDeltaY).toBe(0);
  });

  it('disconnect() stops further events from being buffered', () => {
    const el = setup();
    system.disconnect();

    pointer(el, 'pointerdown', 0, 0, MouseButton.left);
    pointer(el, 'pointermove', 50, 50, MouseButton.left);

    const out = emptyInput();
    system.consume(out);
    expect(out.leftDx).toBe(0);
  });

  it('a duplicate pointerdown for the same pointerId re-anchors instead of duplicating tracking', () => {
    const el = setup();

    pointer(el, 'pointerdown', 0, 0, MouseButton.left);
    pointer(el, 'pointerdown', 20, 20, MouseButton.left); // missed pointerup, fresh down at a new spot
    pointer(el, 'pointermove', 25, 20, MouseButton.left);

    const out = emptyInput();
    system.consume(out);

    // delta measured from the re-anchored position (20,20), not the original (0,0)
    expect(out.leftDx).toBeCloseTo(5, 5);
    expect(out.leftDy).toBeCloseTo(0, 5);
  });

  it('tracks one mouse at a time: a second pointerId is ignored until the first lifts', () => {
    const el = setup();

    pointer(el, 'pointerdown', 0, 0, MouseButton.left, 1);
    pointer(el, 'pointerdown', 100, 100, MouseButton.left, 2);
    pointer(el, 'pointermove', 10, 0, MouseButton.left, 1);
    pointer(el, 'pointermove', 999, 999, MouseButton.left, 2);
    const out = emptyInput();
    system.consume(out);
    expect([out.leftDx, out.leftDy]).toEqual([10, 0]);

    pointer(el, 'pointerup', 10, 0, 0, 1);
    pointer(el, 'pointerdown', 50, 50, MouseButton.left, 2);
    pointer(el, 'pointermove', 60, 55, MouseButton.left, 2);
    system.consume(out);
    expect([out.leftDx, out.leftDy]).toEqual([10, 5]);
  });

  it('a hidden tab drops tracked pointers, so a later pointerdown re-anchors instead of staying stuck', () => {
    const el = setup();

    pointer(el, 'pointerdown', 0, 0, MouseButton.left);
    pointer(el, 'pointermove', 10, 0, MouseButton.left);
    // tab hidden mid-drag - pointerup/pointercancel never arrive (pmndrs/use-gesture#494)
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    pointer(el, 'pointerdown', 200, 200, MouseButton.left); // back on the tab, fresh gesture
    pointer(el, 'pointermove', 210, 205, MouseButton.left);

    const out = emptyInput();
    system.consume(out);

    expect(out.leftDx).toBeCloseTo(20, 5);
    expect(out.leftDy).toBeCloseTo(5, 5);
  });

  it('buffers single-finger touch drag into touchOneDx/Dy, separate from mouse buckets', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0);
    touch(el, 'pointermove', 10, 4);
    touch(el, 'pointermove', 25, 10);
    touch(el, 'pointerup', 25, 10);

    const out = emptyInput();
    system.consume(out);

    expect(out.touchOneDx).toBeCloseTo(25, 5);
    expect(out.touchOneDy).toBeCloseTo(10, 5);
    expect(out.leftDx).toBe(0);
  });

  it('a second finger joining stops touchOneDx/Dy and starts driving touchTwoDx/Dy + touchPinchDelta', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointermove', 10, 0, 1); // one-finger drag before the second finger joins
    touch(el, 'pointerdown', 100, 0, 2); // second finger - baseline distance is 90 (from 10,0 to 100,0)
    touch(el, 'pointermove', 20, 0, 1); // finger 1 moves further - now two-finger mode

    const out = emptyInput();
    system.consume(out);

    expect(out.touchOneDx).toBeCloseTo(10, 5); // unchanged since the second finger joined
    expect(out.touchTwoDx).toBeCloseTo(5, 5); // centroid: (10+100)/2=55 -> (20+100)/2=60
    expect(out.touchPinchDelta).toBeCloseTo(-10, 5); // distance: 90 -> 80, fingers came closer
  });

  it('pinch grows as fingers spread, and stays 0 when both move together as a pan', () => {
    const el = setup();
    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', -50, 0, 1);
    const out = emptyInput();
    system.consume(out);
    expect(out.touchPinchDelta).toBeCloseTo(50, 5);

    touch(el, 'pointermove', -40, 0, 1);
    touch(el, 'pointermove', 110, 0, 2);
    system.consume(out);
    expect(out.touchTwoDx).toBeCloseTo(10, 5);
    expect(out.touchPinchDelta).toBeCloseTo(0, 5);
  });

  it('rotate: a twist produces a signed touchRotateDelta', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2); // angle 0
    touch(el, 'pointermove', 100, 100, 2); // angle atan2(100,100) = 45deg

    const out = emptyInput();
    system.consume(out);

    expect(out.touchRotateDelta).toBeCloseTo(Math.PI / 4, 5);
  });

  it('rotate: crossing the +/-180deg seam is a small step, not a ~360deg jump', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', -100, 1, 2); // angle just under +180deg
    touch(el, 'pointermove', -100, -1, 2); // angle just over -180deg - continues rotating the same way

    const out = emptyInput();
    system.consume(out);

    expect(out.touchRotateDelta).toBeGreaterThan(0);
    expect(out.touchRotateDelta).toBeLessThan(0.1);
  });

  it('rotate and pinch come from the same diagonal move independently, no interference', () => {
    const el = setup();

    touch(el, 'pointerdown', -50, 0, 1);
    touch(el, 'pointerdown', 50, 0, 2); // distance 100, angle 0
    touch(el, 'pointermove', 0, 50, 2); // distance sqrt(50^2+50^2), angle atan2(50,50) = 45deg

    const out = emptyInput();
    system.consume(out);

    expect(out.touchPinchDelta).toBeCloseTo(Math.sqrt(50 * 50 + 50 * 50) - 100, 5);
    expect(out.touchRotateDelta).toBeCloseTo(Math.PI / 4, 5);
  });

  it('lockTouchAxis keeps only the dominant of pinch and rotate', () => {
    const gesture = (x: number, y: number) => {
      const el = setup();
      system.lockTouchAxis = true;
      touch(el, 'pointerdown', 0, 0, 1);
      touch(el, 'pointerdown', 100, 0, 2);
      touch(el, 'pointermove', x, y, 2);
      const out = emptyInput();
      system.consume(out);
      system.disconnect();
      return out;
    };

    const pinch = gesture(150, 5);
    expect(pinch.touchPinchDelta).toBeCloseTo(Math.hypot(150, 5) - 100, 5);
    expect(pinch.touchRotateDelta).toBe(0);
    const rotate = gesture(95, 34);
    expect(rotate.touchRotateDelta).toBeCloseTo(Math.atan2(34, 95), 5);
    expect(rotate.touchPinchDelta).toBe(0);
  });

  it('lockTouchAxis decides once per gesture and decides again for the next one', () => {
    const el = setup();
    system.lockTouchAxis = true;
    const out = emptyInput();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', 95, 34, 2); // twist: locks to rotate
    touch(el, 'pointermove', 190, 68, 2); // pure spread from here on
    system.consume(out);
    expect(out.touchPinchDelta).toBe(0);

    touch(el, 'pointerup', 190, 68, 2);
    touch(el, 'pointerup', 0, 0, 1);
    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', 150, 5, 2); // spread: locks to pinch this time
    system.consume(out);
    expect(out.touchPinchDelta).toBeCloseTo(Math.hypot(150, 5) - 100, 5);
    expect(out.touchRotateDelta).toBe(0);
  });

  it('a third finger joining starts three-finger tracking - touchTwoDx/Dy stops, touchThreeDx/Dy takes over', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', 10, 0, 1); // two-finger mode: centroid 50 -> 55
    touch(el, 'pointerdown', 50, 50, 3); // third finger joins - now three-finger mode
    touch(el, 'pointermove', 60, 50, 3); // finger 3 moves +10 in x

    const out = emptyInput();
    system.consume(out);

    expect(out.touchTwoDx).toBeCloseTo(5, 5); // unchanged since the third finger joined
    expect(out.touchThreeDx).toBeCloseTo(10 / 3, 5); // centroid: (10+100+50)/3 -> (10+100+60)/3
  });

  it('a fourth finger touching down while three are tracked is ignored - the three keep going', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointerdown', 50, 50, 3);
    touch(el, 'pointerdown', 999, 999, 4); // fourth finger - ignored entirely
    touch(el, 'pointermove', 60, 50, 3);
    touch(el, 'pointermove', 0, 0, 4); // must not affect the buffer

    const out = emptyInput();
    system.consume(out);

    expect(out.touchThreeDx).toBeCloseTo(10 / 3, 5);
  });

  it('lifting the third finger drops back to two-finger mode with a fresh pinch baseline, no jump', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2); // distance 100
    touch(el, 'pointerdown', 50, 50, 3); // three-finger mode starts
    touch(el, 'pointermove', 30, 0, 1); // finger 1 drifts during three-finger mode
    touch(el, 'pointerup', 50, 50, 3); // back to two fingers - now 70 apart, not the original 100
    touch(el, 'pointermove', 130, 0, 2); // spreads to 100 apart again

    const out = emptyInput();
    system.consume(out);

    // fresh baseline: 100 - 70 = 30. A stale baseline (the original 100) would wrongly give ~0.
    expect(out.touchPinchDelta).toBeCloseTo(30, 5);
  });

  it('lifting the first finger while three are tracked promotes the other two, fresh pinch baseline', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointerdown', 250, 0, 3); // finger 2<->3 distance is 150
    touch(el, 'pointerup', 0, 0, 1); // finger 1 lifts - fingers 2 and 3 promoted down a slot
    touch(el, 'pointermove', 300, 0, 3); // spreads finger 2<->3 to 200 apart

    const out = emptyInput();
    system.consume(out);

    // fresh baseline: 200 - 150 = 50. A stale baseline (from the original 1<->2 pair, 100) would be wrong.
    expect(out.touchPinchDelta).toBeCloseTo(50, 5);
  });

  it('lifting the first finger while the second is down promotes it - a fresh one-finger drag, no jump', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointerup', 0, 0, 1);
    touch(el, 'pointermove', 110, 0, 2);

    const out = emptyInput();
    system.consume(out);

    expect(out.touchOneDx).toBeCloseTo(10, 5);
    expect(out.touchTwoDx).toBe(0);
  });

  it('lifting the second finger keeps the first tracked as a one-finger drag, no jump', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointerup', 100, 0, 2);
    touch(el, 'pointermove', 10, 0, 1);

    const out = emptyInput();
    system.consume(out);

    expect(out.touchOneDx).toBeCloseTo(10, 5);
    expect(out.touchTwoDx).toBe(0);
  });

  it('the second finger can start its own drag once the first lifts', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerup', 0, 0, 1);
    touch(el, 'pointerdown', 50, 50, 2);
    touch(el, 'pointermove', 60, 55, 2);

    const out = emptyInput();
    system.consume(out);

    expect(out.touchOneDx).toBeCloseTo(10, 5);
    expect(out.touchOneDy).toBeCloseTo(5, 5);
  });

  it('ignores pen pointers entirely, for now', () => {
    const el = setup();
    el.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 3, clientX: 0, clientY: 0, bubbles: true, pointerType: 'pen' }),
    );
    el.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 3, clientX: 50, clientY: 50, bubbles: true, pointerType: 'pen' }),
    );

    const out = emptyInput();
    system.consume(out);
    expect(out.leftDx).toBe(0);
    expect(out.touchOneDx).toBe(0);
  });

  describe('suppressContextMenu', () => {
    it('prevents the native menu only when enabled', () => {
      const el = setup();
      const open = () => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      };

      expect(open()).toBe(false);
      system.suppressContextMenu = true;
      expect(open()).toBe(true);
    });
  });

  describe('Pointer Lock', () => {
    it('requests the lock on its element and releases only its own lock', () => {
      const el = setup();
      system.requestPointerLock();
      expect(document.pointerLockElement).toBe(el);
      system.exitPointerLock();
      expect(document.pointerLockElement).toBe(null);

      const other = document.createElement('div');
      Object.defineProperty(document, 'pointerLockElement', { value: other, configurable: true });
      system.exitPointerLock();
      expect(document.pointerLockElement).toBe(other);
    });

    it('pointermove deltas come from movementX/Y while locked, not clientX/Y', () => {
      const el = setup();
      pointer(el, 'pointerdown', 0, 0, MouseButton.left);
      system.requestPointerLock();
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          movementX: 7,
          movementY: -3,
          buttons: MouseButton.left,
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBeCloseTo(7, 5);
      expect(out.leftDy).toBeCloseTo(-3, 5);
    });

    it('movement while locked with no button held goes into lockedDx/Dy, not leftDx/Dy', () => {
      const el = setup();
      system.requestPointerLock();
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          movementX: 12,
          movementY: 4,
          buttons: 0,
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );

      const out = emptyInput();
      system.consume(out);
      expect(out.lockedDx).toBeCloseTo(12, 5);
      expect(out.lockedDy).toBeCloseTo(4, 5);
      expect(out.leftDx).toBe(0);
    });

    it('movement while unlocked with no button held is ignored entirely', () => {
      const el = setup();
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          movementX: 12,
          movementY: 4,
          buttons: 0,
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );

      const out = emptyInput();
      system.consume(out);
      expect(out.lockedDx).toBe(0);
      expect(out.lockedDy).toBe(0);
    });

    it('holding a button while locked keeps going into that button bucket, not lockedDx/Dy', () => {
      const el = setup();
      pointer(el, 'pointerdown', 0, 0, MouseButton.left);
      system.requestPointerLock();
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          movementX: 9,
          movementY: -2,
          buttons: MouseButton.left,
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBeCloseTo(9, 5);
      expect(out.lockedDx).toBe(0);
    });

    it('a lock lost outside request/exitPointerLock (e.g. Escape) makes the next move re-anchor instead of jumping', () => {
      const el = setup();
      pointer(el, 'pointerdown', 0, 0, MouseButton.left);
      system.requestPointerLock();
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          movementX: 5,
          movementY: 5,
          buttons: MouseButton.left,
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );

      // the browser drops the lock on its own - clientX/Y un-freeze at the real cursor position
      Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
      pointer(el, 'pointermove', 500, 500, MouseButton.left);

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBeCloseTo(5, 5);
      expect(out.leftDy).toBeCloseTo(5, 5);
    });

    it("disconnect() does NOT release an active pointer lock - it's document-level state, released explicitly via exitPointerLock()", () => {
      setup();
      system.requestPointerLock();
      system.disconnect();
      expect(document.pointerLockElement).not.toBe(null);
    });

    it('reconnecting to the same element while still locked resumes lockedDx/Dy without re-requesting', () => {
      const el = setup();
      system.requestPointerLock();
      system.disconnect();
      system.connect(el);

      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          movementX: 8,
          movementY: 3,
          buttons: 0,
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );

      const out = emptyInput();
      system.consume(out);
      expect(out.lockedDx).toBeCloseTo(8, 5);
      expect(out.lockedDy).toBeCloseTo(3, 5);
    });

    it('the lock-lost re-anchor safety net still works after a disconnect/reconnect cycle that kept the lock alive', () => {
      const el = setup();
      pointer(el, 'pointerdown', 0, 0, MouseButton.left);
      system.requestPointerLock();
      system.disconnect();
      system.connect(el); // reconnect - the OS lock never actually changed, relies on connect()'s own resync
      pointer(el, 'pointerdown', 0, 0, MouseButton.left); // re-anchor activePointer, reset by disconnect()

      el.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          movementX: 5,
          movementY: 5,
          buttons: MouseButton.left,
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );

      // the browser drops the lock on its own
      Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
      pointer(el, 'pointermove', 500, 500, MouseButton.left);

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBeCloseTo(5, 5); // re-anchored - the 500,500 jump isn't added
      expect(out.leftDy).toBeCloseTo(5, 5);
    });

    it('warns when the browser rejects the lock', () => {
      setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      document.dispatchEvent(new Event('pointerlockerror'));
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe('interactiveArea', () => {
    it('only starts drags inside it, and keeps a started drag going outside it', () => {
      const el = setup();
      const drag = (fromX: number, toX: number) => {
        pointer(el, 'pointerdown', fromX, 10, MouseButton.left);
        pointer(el, 'pointermove', toX, 10, MouseButton.left);
        pointer(el, 'pointerup', toX, 10, 0);
        const out = emptyInput();
        system.consume(out);
        return out.leftDx;
      };

      expect(drag(5, 15)).toBeCloseTo(10, 5); // no area: the whole element
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 }; // right half
      expect(drag(10, 20)).toBe(0);
      expect(drag(60, 70)).toBeCloseTo(10, 5);
      expect(drag(60, 0)).toBeCloseTo(-60, 5);
    });

    it('gates the wheel too, except while the pointer is locked', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };
      const wheel = (clientX: number) => {
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX, clientY: 10, bubbles: true }));
        const out = emptyInput();
        system.consume(out);
        return out.wheelDeltaY;
      };

      expect(wheel(10)).toBe(0);
      expect(wheel(60)).toBeCloseTo(100, 5);
      expect(system.isInsideInteractiveArea(10, 10)).toBe(false);

      system.requestPointerLock(); // a locked pointer reports a frozen position, possibly outside
      expect(wheel(0)).toBeCloseTo(100, 5);
      expect(system.isInsideInteractiveArea(10, 10)).toBe(true);
    });
  });

  describe('Safari gesture events', () => {
    it('buffers scale steps into gestureZoomDelta and rotation steps into touchRotateDelta, in radians', () => {
      const el = setup();
      gesture(el, 'gesturestart', 1, 0);
      gesture(el, 'gesturechange', 1.1, 0);
      gesture(el, 'gesturechange', 1.15, 10);

      const out = emptyInput();
      system.consume(out);

      expect(out.gestureZoomDelta).toBeCloseTo(0.15, 5);
      expect(out.touchRotateDelta).toBeCloseTo((10 * Math.PI) / 180, 5);
    });

    it('gesturestart outside interactiveArea is ignored - its gesturechange does nothing', () => {
      const el = setup();
      element.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }) as DOMRect;
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };

      gesture(el, 'gesturestart', 1, 0, 10, 10); // left half - outside
      gesture(el, 'gesturechange', 1.1, 0, 10, 10);

      const out = emptyInput();
      system.consume(out);
      expect(out.gestureZoomDelta).toBe(0);
    });

    it('a fresh gesturestart resets the scale baseline - no stale jump from the previous gesture', () => {
      const el = setup();
      gesture(el, 'gesturestart', 1, 0);
      gesture(el, 'gesturechange', 2, 0); // scale reaches 2 by the end of this gesture
      gesture(el, 'gestureend', 2, 0);
      system.consume(emptyInput()); // drain gesture 1's output before checking gesture 2 in isolation

      gesture(el, 'gesturestart', 1, 0); // WebKit resets scale/rotation to 1/0 per gesture
      gesture(el, 'gesturechange', 1.1, 0);

      const out = emptyInput();
      system.consume(out);
      expect(out.gestureZoomDelta).toBeCloseTo(0.1, 5); // not -0.9, which a stale lastGestureScale=2 would give
    });

    describe('lockTouchAxis', () => {
      it('keeps only the dominant of scale and rotation', () => {
        const gestureWith = (scale: number, rotation: number) => {
          const el = setup();
          system.lockTouchAxis = true;
          gesture(el, 'gesturestart', 1, 0);
          gesture(el, 'gesturechange', scale, rotation);
          const out = emptyInput();
          system.consume(out);
          system.disconnect();
          return out;
        };

        const zoom = gestureWith(1.5, 5);
        expect(zoom.gestureZoomDelta).toBeCloseTo(0.5, 5);
        expect(zoom.touchRotateDelta).toBe(0);
        const turn = gestureWith(1.01, 20);
        expect(turn.touchRotateDelta).toBeCloseTo((20 * Math.PI) / 180, 5);
        expect(turn.gestureZoomDelta).toBe(0);
      });

      it('decides once per gesture and decides again for the next one', () => {
        const el = setup();
        system.lockTouchAxis = true;
        const out = emptyInput();

        gesture(el, 'gesturestart', 1, 0);
        gesture(el, 'gesturechange', 1.01, 20); // locks to rotate
        gesture(el, 'gesturechange', 1.5, 20);
        system.consume(out);
        expect(out.gestureZoomDelta).toBe(0);

        gesture(el, 'gestureend', 1.5, 20);
        gesture(el, 'gesturestart', 1, 0);
        gesture(el, 'gesturechange', 1.5, 5); // locks to pinch this time
        system.consume(out);
        expect(out.gestureZoomDelta).toBeCloseTo(0.5, 5);
        expect(out.touchRotateDelta).toBe(0);
      });
    });
  });

  describe('held state', () => {
    it('reports which mouse buttons are down until the pointer lifts or disconnects, across reads', () => {
      const el = setup();
      const out = emptyInput();
      pointer(el, 'pointerdown', 0, 0, MouseButton.left | MouseButton.right);

      system.consume(out);
      system.consume(out);
      expect([out.leftHeld, out.rightHeld, out.middleHeld]).toEqual([true, true, false]);

      pointer(el, 'pointerup', 0, 0, 0);
      system.consume(out);
      expect([out.leftHeld, out.rightHeld]).toEqual([false, false]);

      pointer(el, 'pointerdown', 0, 0, MouseButton.left);
      system.disconnect();
      system.consume(out);
      expect(out.leftHeld).toBe(false);
    });

    it('reports how many fingers are down, one gesture bucket at a time', () => {
      const el = setup();
      const out = emptyInput();
      const held = () => {
        system.consume(out);
        return [out.touchOneHeld, out.touchTwoHeld, out.touchThreeHeld];
      };

      touch(el, 'pointerdown', 0, 0, 1);
      expect(held()).toEqual([true, false, false]);
      touch(el, 'pointerdown', 10, 10, 2);
      expect(held()).toEqual([false, true, false]);
      touch(el, 'pointerdown', 20, 20, 3);
      expect(held()).toEqual([false, false, true]);
      touch(el, 'pointerup', 20, 20, 3);
      expect(held()).toEqual([false, true, false]);
    });
  });
});
