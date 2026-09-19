import { afterEach, describe, expect, it } from 'vitest';
import { InputSystem, MouseButton, type ConsumedInput } from '../../src/input/InputSystem';

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
  return {
    leftDx: 0,
    leftDy: 0,
    middleDx: 0,
    middleDy: 0,
    rightDx: 0,
    rightDy: 0,
    touchOneDx: 0,
    touchOneDy: 0,
    touchTwoDx: 0,
    touchTwoDy: 0,
    touchPinchDelta: 0,
    touchRotateDelta: 0,
    gestureZoomDelta: 0,
    wheelDeltaX: 0,
    wheelDeltaY: 0,
    wheelZoomDelta: 0,
    lockedDx: 0,
    lockedDy: 0,
  };
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

  it('routes right-drag into rightDx/rightDy, not left', () => {
    const el = setup();

    pointer(el, 'pointerdown', 0, 0, MouseButton.right);
    pointer(el, 'pointermove', 5, 5, MouseButton.right);

    const out = emptyInput();
    system.consume(out);

    expect(out.rightDx).toBeCloseTo(5, 5);
    expect(out.leftDx).toBe(0);
  });

  it('a single move while two buttons are held feeds the same delta into both', () => {
    const el = setup();
    const both = MouseButton.left | MouseButton.right;

    pointer(el, 'pointerdown', 0, 0, both);
    pointer(el, 'pointermove', 10, 0, both);

    const out = emptyInput();
    system.consume(out);

    expect(out.leftDx).toBeCloseTo(10, 5);
    expect(out.rightDx).toBeCloseTo(10, 5);
  });

  it('buffers wheel deltaY', () => {
    const el = setup();
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));

    const out = emptyInput();
    system.consume(out);
    expect(out.wheelDeltaY).toBeCloseTo(100, 5);
  });

  it('buffers wheel deltaX independently of deltaY', () => {
    const el = setup();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 30, deltaY: 100, bubbles: true }));

    const out = emptyInput();
    system.consume(out);
    expect(out.wheelDeltaX).toBeCloseTo(30, 5);
    expect(out.wheelDeltaY).toBeCloseTo(100, 5);
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

  it('shift+wheel on a single-axis wheel (deltaX 0) routes deltaY into wheelDeltaX instead', () => {
    const el = setup();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 40, shiftKey: true, bubbles: true }));

    const out = emptyInput();
    system.consume(out);
    expect(out.wheelDeltaX).toBeCloseTo(40, 5);
    expect(out.wheelDeltaY).toBe(0);
  });

  it('shift+wheel with a real deltaX (trackpad) is left alone, not doubled up with deltaY', () => {
    const el = setup();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 15, deltaY: 40, shiftKey: true, bubbles: true }));

    const out = emptyInput();
    system.consume(out);
    expect(out.wheelDeltaX).toBeCloseTo(15, 5);
    expect(out.wheelDeltaY).toBeCloseTo(40, 5);
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

  it('a second, distinct mouse pointerId while one is already tracked is ignored - the first keeps going', () => {
    const el = setup();

    pointer(el, 'pointerdown', 0, 0, MouseButton.left, 1);
    pointer(el, 'pointerdown', 100, 100, MouseButton.left, 2); // a second physical mouse - ignored
    pointer(el, 'pointermove', 10, 0, MouseButton.left, 1);
    pointer(el, 'pointermove', 999, 999, MouseButton.left, 2); // must not affect the buffer

    const out = emptyInput();
    system.consume(out);

    expect(out.leftDx).toBeCloseTo(10, 5);
    expect(out.leftDy).toBeCloseTo(0, 5);
  });

  it('a second mouse pointerId can start its own drag once the first lifts', () => {
    const el = setup();

    pointer(el, 'pointerdown', 0, 0, MouseButton.left, 1);
    pointer(el, 'pointerup', 0, 0, 0, 1);
    pointer(el, 'pointerdown', 50, 50, MouseButton.left, 2);
    pointer(el, 'pointermove', 60, 55, MouseButton.left, 2);

    const out = emptyInput();
    system.consume(out);

    expect(out.leftDx).toBeCloseTo(10, 5);
    expect(out.leftDy).toBeCloseTo(5, 5);
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

  it('pinch: fingers spreading apart produces a positive touchPinchDelta', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2); // baseline distance 100
    touch(el, 'pointermove', -50, 0, 1); // spreads to a distance of 150

    const out = emptyInput();
    system.consume(out);

    expect(out.touchPinchDelta).toBeCloseTo(50, 5);
  });

  it('pinch + pan together: both fingers moving by the same amount is pure pan, net pinch stays ~0', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', 10, 0, 1);
    touch(el, 'pointermove', 110, 0, 2);

    const out = emptyInput();
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

  it('lockTouchAxis: a scale-dominant move suppresses touchRotateDelta entirely', () => {
    const el = setup();
    system.lockTouchAxis = true;

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2); // distance 100, angle 0
    touch(el, 'pointermove', 150, 5, 2); // mostly radial, a little diagonal

    const out = emptyInput();
    system.consume(out);

    const distance = Math.sqrt(150 * 150 + 5 * 5);
    expect(out.touchPinchDelta).toBeCloseTo(distance - 100, 5);
    expect(out.touchRotateDelta).toBe(0);
  });

  it('lockTouchAxis: a rotate-dominant move suppresses touchPinchDelta entirely', () => {
    const el = setup();
    system.lockTouchAxis = true;

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', 95, 34, 2); // mostly a twist, barely any distance change

    const out = emptyInput();
    system.consume(out);

    expect(out.touchRotateDelta).toBeCloseTo(Math.atan2(34, 95), 5);
    expect(out.touchPinchDelta).toBe(0);
  });

  it('lockTouchAxis: once decided, the lock persists for the rest of the gesture', () => {
    const el = setup();
    system.lockTouchAxis = true;

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', 95, 34, 2); // rotate-dominant - locks to 'rotate'
    touch(el, 'pointermove', 190, 68, 2); // pure radial from here on - looks pinch-dominant alone

    const out = emptyInput();
    system.consume(out);

    expect(out.touchPinchDelta).toBe(0); // still suppressed, the lock doesn't re-evaluate mid-gesture
  });

  it('lockTouchAxis: lifting both fingers resets the lock for the next gesture', () => {
    const el = setup();
    system.lockTouchAxis = true;

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointermove', 95, 34, 2); // locks to 'rotate' this gesture
    touch(el, 'pointerup', 95, 34, 2);
    touch(el, 'pointerup', 0, 0, 1);
    system.consume(emptyInput()); // drain the first gesture's buffered rotate delta before the next one

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2); // fresh gesture, distance 100, angle 0
    touch(el, 'pointermove', 150, 5, 2); // scale-dominant - should lock to 'pinch' this time

    const out = emptyInput();
    system.consume(out);

    const distance = Math.sqrt(150 * 150 + 5 * 5);
    expect(out.touchPinchDelta).toBeCloseTo(distance - 100, 5);
    expect(out.touchRotateDelta).toBe(0);
  });

  it('a third finger touching down while two are tracked is ignored - the two keep going', () => {
    const el = setup();

    touch(el, 'pointerdown', 0, 0, 1);
    touch(el, 'pointerdown', 100, 0, 2);
    touch(el, 'pointerdown', 50, 50, 3); // third finger - ignored entirely
    touch(el, 'pointermove', 10, 0, 1);
    touch(el, 'pointermove', 999, 999, 3); // must not affect the buffer

    const out = emptyInput();
    system.consume(out);

    expect(out.touchTwoDx).toBeCloseTo(5, 5); // centroid: 50 -> 55, from finger 1 alone moving
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

  it('consume() writes into and returns the same out object (no allocation)', () => {
    setup();
    const out = emptyInput();
    const returned = system.consume(out);
    expect(returned).toBe(out);
  });

  describe('suppressContextMenu', () => {
    it('false by default - the native menu is left alone', () => {
      const el = setup();
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it('true - prevents the native menu', () => {
      const el = setup();
      system.suppressContextMenu = true;
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('Pointer Lock', () => {
    it('requestPointerLock() requests it on the connected element', () => {
      const el = setup();
      system.requestPointerLock();
      expect(document.pointerLockElement).toBe(el);
    });

    it("exitPointerLock() releases the lock when this system's element holds it", () => {
      setup();
      system.requestPointerLock();
      system.exitPointerLock();
      expect(document.pointerLockElement).toBe(null);
    });

    it('exitPointerLock() does nothing when a different element holds the lock', () => {
      setup();
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

    it('disconnect() releases an active pointer lock held by its element', () => {
      setup();
      system.requestPointerLock();
      system.disconnect();
      expect(document.pointerLockElement).toBe(null);
    });

    it('a pointerlockerror event does not throw', () => {
      setup();
      expect(() => document.dispatchEvent(new Event('pointerlockerror'))).not.toThrow();
    });
  });

  describe('interactiveArea', () => {
    it('null (default) - the whole element reacts', () => {
      const el = setup();
      pointer(el, 'pointerdown', 5, 5, MouseButton.left);
      pointer(el, 'pointermove', 15, 5, MouseButton.left);

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBeCloseTo(10, 5);
    });

    it('a pointerdown outside the area is ignored - no drag starts', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 }; // right half only

      pointer(el, 'pointerdown', 10, 10, MouseButton.left); // left half - outside
      pointer(el, 'pointermove', 20, 10, MouseButton.left);

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBe(0);
    });

    it('a pointerdown inside the area starts a drag normally', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };

      pointer(el, 'pointerdown', 60, 10, MouseButton.left); // right half - inside
      pointer(el, 'pointermove', 70, 10, MouseButton.left);

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBeCloseTo(10, 5);
    });

    it('a drag that starts inside keeps going after moving outside the area', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };

      pointer(el, 'pointerdown', 60, 10, MouseButton.left);
      pointer(el, 'pointermove', 0, 10, MouseButton.left); // now well outside the area

      const out = emptyInput();
      system.consume(out);
      expect(out.leftDx).toBeCloseTo(-60, 5);
    });

    it('wheel outside the area is ignored', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };

      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 10, clientY: 10, bubbles: true }));

      const out = emptyInput();
      system.consume(out);
      expect(out.wheelDeltaY).toBe(0);
    });

    it('wheel inside the area is buffered normally', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };

      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 60, clientY: 10, bubbles: true }));

      const out = emptyInput();
      system.consume(out);
      expect(out.wheelDeltaY).toBeCloseTo(100, 5);
    });

    it('once locked, wheel is no longer gated by the area - clientX/Y freeze at the lock position', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };
      system.requestPointerLock();

      // clientX/Y frozen outside the area (0,0) is what every subsequent event would report while locked
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 0, clientY: 0, bubbles: true }));

      const out = emptyInput();
      system.consume(out);
      expect(out.wheelDeltaY).toBeCloseTo(100, 5);
    });

    it('isInsideInteractiveArea() reports the same bypass-while-locked a consumer can rely on', () => {
      const el = setup();
      system.interactiveArea = { x: 0.5, y: 0, width: 0.5, height: 1 };

      expect(system.isInsideInteractiveArea(10, 10)).toBe(false);
      system.requestPointerLock();
      expect(system.isInsideInteractiveArea(10, 10)).toBe(true);
    });
  });

  describe('Safari gesture events', () => {
    it('scale change buffers into gestureZoomDelta', () => {
      const el = setup();
      gesture(el, 'gesturestart', 1, 0);
      gesture(el, 'gesturechange', 1.1, 0);

      const out = emptyInput();
      system.consume(out);
      expect(out.gestureZoomDelta).toBeCloseTo(0.1, 5);
      expect(out.touchRotateDelta).toBe(0);
    });

    it('rotation change buffers into touchRotateDelta, converted from degrees to radians', () => {
      const el = setup();
      gesture(el, 'gesturestart', 1, 0);
      gesture(el, 'gesturechange', 1, 10);

      const out = emptyInput();
      system.consume(out);
      expect(out.touchRotateDelta).toBeCloseTo((10 * Math.PI) / 180, 5);
      expect(out.gestureZoomDelta).toBe(0);
    });

    it('scale/rotation are cumulative since gesturestart - each change buffers only the step', () => {
      const el = setup();
      gesture(el, 'gesturestart', 1, 0);
      gesture(el, 'gesturechange', 1.1, 0);
      gesture(el, 'gesturechange', 1.15, 0); // +0.05 from here, not +0.15 from the start

      const out = emptyInput();
      system.consume(out);
      expect(out.gestureZoomDelta).toBeCloseTo(0.15, 5);
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
      it('a scale-dominant gesture suppresses touchRotateDelta entirely', () => {
        const el = setup();
        system.lockTouchAxis = true;
        gesture(el, 'gesturestart', 1, 0);
        gesture(el, 'gesturechange', 1.5, 5); // scaleFraction 0.5 * 30 = 15 vs 5deg - scale wins

        const out = emptyInput();
        system.consume(out);
        expect(out.gestureZoomDelta).toBeCloseTo(0.5, 5);
        expect(out.touchRotateDelta).toBe(0);
      });

      it('a rotate-dominant gesture suppresses gestureZoomDelta entirely', () => {
        const el = setup();
        system.lockTouchAxis = true;
        gesture(el, 'gesturestart', 1, 0);
        gesture(el, 'gesturechange', 1.01, 20); // scaleFraction 0.01 * 30 = 0.3 vs 20deg - rotate wins

        const out = emptyInput();
        system.consume(out);
        expect(out.touchRotateDelta).toBeCloseTo((20 * Math.PI) / 180, 5);
        expect(out.gestureZoomDelta).toBe(0);
      });

      it('once decided, the lock persists for the rest of the gesture', () => {
        const el = setup();
        system.lockTouchAxis = true;
        gesture(el, 'gesturestart', 1, 0);
        gesture(el, 'gesturechange', 1.01, 20); // locks to 'rotate'
        gesture(el, 'gesturechange', 1.5, 20); // pure scale from here - still suppressed

        const out = emptyInput();
        system.consume(out);
        expect(out.gestureZoomDelta).toBe(0);
      });

      it('a fresh gesturestart resets the lock for the next gesture', () => {
        const el = setup();
        system.lockTouchAxis = true;
        gesture(el, 'gesturestart', 1, 0);
        gesture(el, 'gesturechange', 1.01, 20); // locks to 'rotate' this gesture
        gesture(el, 'gestureend', 1.01, 20);
        system.consume(emptyInput()); // drain the first gesture's buffered rotate delta

        gesture(el, 'gesturestart', 1, 0);
        gesture(el, 'gesturechange', 1.5, 5); // scale-dominant - should lock to 'pinch' this time

        const out = emptyInput();
        system.consume(out);
        expect(out.gestureZoomDelta).toBeCloseTo(0.5, 5);
        expect(out.touchRotateDelta).toBe(0);
      });
    });
  });
});
