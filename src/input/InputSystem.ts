import { shortestWrappedDelta } from './shortestWrappedDelta';

export const MouseButton = {
  left: 1,
  right: 2,
  middle: 4,
} as const;

type ActivePointer = {
  pointerId: number;
  x: number;
  y: number;
};

// Safari/WebKit's own, non-standard trackpad pinch/rotate event - never standardized, so not in the DOM
// lib types. scale/rotation are CUMULATIVE since gesturestart, not per-frame deltas.
type WebKitGestureEvent = Event & {
  scale: number;
  rotation: number;
  clientX: number;
  clientY: number;
  cancelable: boolean;
};

function distanceBetween(a: ActivePointer, b: ActivePointer): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleBetween(a: ActivePointer, b: ActivePointer): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

const SCALE_ANGLE_RATIO_INTENT_DEG = 30;

/** Normalized `[0,1]` rect of the element's bounds, origin top-left - see `InputSystem.interactiveArea`. */
export type InteractiveArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ConsumedInput = {
  leftDx: number;
  leftDy: number;
  middleDx: number;
  middleDy: number;
  rightDx: number;
  rightDy: number;
  /** Single-finger touch drag - deliberately its own bucket, not merged into `leftDx/Dy` */
  touchOneDx: number;
  touchOneDy: number;
  /** Two-finger centroid movement - computed alongside `touchPinchDelta` from the same two points every move.
   *  Stops once a second finger joins `touchOneDx/Dy`. */
  touchTwoDx: number;
  touchTwoDy: number;
  /** Two-finger distance change - positive as the fingers spread apart */
  touchPinchDelta: number;
  /** Two-finger twist, in radians - `Math.atan2`'s sign, so positive turns clockwise on screen.
   *  Shortest-path per move, so a gesture can spin past +/-180° without a 360° jump.
   *  Also carries Safari's native trackpad gesture rotation, degrees converted. */
  touchRotateDelta: number;
  /** Safari/WebKit-only trackpad pinch, from its non-standard `gesturechange` event - dimensionless, NOT
   *  a pixel distance like `touchPinchDelta`. Chrome and Firefox report the same gesture as `wheel` +
   *  `ctrlKey` instead. */
  gestureZoomDelta: number;
  wheelDeltaX: number;
  wheelDeltaY: number;
  /** Trackpad pinch-to-zoom on macOS arrives as a `wheel` event with `ctrlKey: true` -
   *  a separate bucket so it doesn't get mixed into genuine `wheelDeltaY` scrolling. */
  wheelZoomDelta: number;
  /** Raw mouse movement while Pointer Lock is active and no button is held. */
  lockedDx: number;
  lockedDy: number;
};

/**
 * Buffers raw mouse drag, one and two-finger touch, and wheel deltas from a DOM element -
 * hand-rolled Pointer Events + Pointer Capture, zero knowledge of camera/canvas/semantics.
 * `InputController` classifies and shapes this into named `InputAxis` deltas. `consume()` drains the buffer once per frame. */
export class InputSystem {
  /** Suppresses the native right-click menu */
  suppressContextMenu = false;

  /** Restricts inputs to a normalized rect of the element's bounds - `null` means the whole element.
   *  Only the gesture's start position is checked, not ongoing movement. */
  interactiveArea: InteractiveArea | null = null;

  /** A diagonal two-finger move otherwise feeds both `touchPinchDelta` and `touchRotateDelta` at once -
   *  turn this on to commit to whichever one dominates and zero the other, for the rest of that gesture. */
  lockTouchAxis = false;

  private element: HTMLElement | null = null;
  private activePointer: ActivePointer | null = null;
  private touchPointer: ActivePointer | null = null;
  private touchPointer2: ActivePointer | null = null;
  private touchPinchDistance = 0;
  private touchAngle = 0;
  private touchGestureStartDistance = 0;
  private touchGestureRotateTotal = 0;
  private touchAxisLock: 'pinch' | 'rotate' | null = null;

  private gestureActive = false;
  private lastGestureScale = 1;
  private lastGestureRotationDeg = 0;
  private gestureRotateTotalDeg = 0;
  private gestureAxisLock: 'pinch' | 'rotate' | null = null;

  private leftDx = 0;
  private leftDy = 0;
  private middleDx = 0;
  private middleDy = 0;
  private rightDx = 0;
  private rightDy = 0;
  private touchOneDx = 0;
  private touchOneDy = 0;
  private touchTwoDx = 0;
  private touchTwoDy = 0;
  private touchPinchDelta = 0;
  private touchRotateDelta = 0;
  private gestureZoomDelta = 0;
  private wheelDeltaX = 0;
  private wheelDeltaY = 0;
  private wheelZoomDelta = 0;
  private lockedDx = 0;
  private lockedDy = 0;
  private locked = false;

  /** Attaches listeners to `element`. Safe to call again with a new element - disconnects the old one first. */
  connect = (element: HTMLElement): void => {
    this.disconnect();
    this.element = element;
    // native touch-scroll/selection would otherwise fight a drag on the same element
    element.style.touchAction = 'none';
    element.style.userSelect = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
    element.addEventListener('gesturestart', this.onGestureStart as EventListener);
    element.addEventListener('gesturechange', this.onGestureChange as EventListener);
    element.addEventListener('gestureend', this.onGestureEnd);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  };

  disconnect = (): void => {
    if (!this.element) return;
    this.element.style.touchAction = '';
    this.element.style.userSelect = '';
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    this.element.removeEventListener('gesturestart', this.onGestureStart as EventListener);
    this.element.removeEventListener('gesturechange', this.onGestureChange as EventListener);
    this.element.removeEventListener('gestureend', this.onGestureEnd);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (document.pointerLockElement === this.element) document.exitPointerLock();
    this.element = null;
    this.activePointer = null;
    this.touchPointer = null;
    this.touchPointer2 = null;
    this.gestureActive = false;
    this.locked = false;
  };

  requestPointerLock = (): void => {
    this.element?.requestPointerLock();
  };

  exitPointerLock = (): void => {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  };

  consume = (out: ConsumedInput): ConsumedInput => {
    out.leftDx = this.leftDx;
    out.leftDy = this.leftDy;
    out.middleDx = this.middleDx;
    out.middleDy = this.middleDy;
    out.rightDx = this.rightDx;
    out.rightDy = this.rightDy;
    out.touchOneDx = this.touchOneDx;
    out.touchOneDy = this.touchOneDy;
    out.touchTwoDx = this.touchTwoDx;
    out.touchTwoDy = this.touchTwoDy;
    out.touchPinchDelta = this.touchPinchDelta;
    out.touchRotateDelta = this.touchRotateDelta;
    out.gestureZoomDelta = this.gestureZoomDelta;
    out.wheelDeltaX = this.wheelDeltaX;
    out.wheelDeltaY = this.wheelDeltaY;
    out.wheelZoomDelta = this.wheelZoomDelta;
    out.lockedDx = this.lockedDx;
    out.lockedDy = this.lockedDy;
    this.leftDx = 0;
    this.leftDy = 0;
    this.middleDx = 0;
    this.middleDy = 0;
    this.rightDx = 0;
    this.rightDy = 0;
    this.touchOneDx = 0;
    this.touchOneDy = 0;
    this.touchTwoDx = 0;
    this.touchTwoDy = 0;
    this.touchPinchDelta = 0;
    this.touchRotateDelta = 0;
    this.gestureZoomDelta = 0;
    this.wheelDeltaX = 0;
    this.wheelDeltaY = 0;
    this.wheelZoomDelta = 0;
    this.lockedDx = 0;
    this.lockedDy = 0;
    return out;
  };

  /** Whether `clientX/Y` falls within `interactiveArea` - always `true` once Pointer Lock is active on
   *  this element, since `clientX/Y` then freezes at the lock-engage position, meaningless as a "where". */
  isInsideInteractiveArea(clientX: number, clientY: number): boolean {
    if (!this.interactiveArea || !this.element) return true;
    if (document.pointerLockElement === this.element) return true;
    const rect = this.element.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    const area = this.interactiveArea;
    return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.isInsideInteractiveArea(event.clientX, event.clientY)) return;
    if (event.pointerType === 'touch') {
      if (!this.touchPointer) {
        this.touchPointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      } else if (!this.touchPointer2 && event.pointerId !== this.touchPointer.pointerId) {
        this.touchPointer2 = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        this.touchPinchDistance = distanceBetween(this.touchPointer, this.touchPointer2);
        this.touchAngle = angleBetween(this.touchPointer, this.touchPointer2);
        this.touchGestureStartDistance = this.touchPinchDistance;
        this.touchGestureRotateTotal = 0;
        this.touchAxisLock = null;
      } else {
        // a third finger, or a duplicate pointerId ignored
        return;
      }
    } else if (event.pointerType === 'mouse') {
      if (this.activePointer && this.activePointer.pointerId !== event.pointerId) {
        // a second mouse pointerId while one is already tracked is ignored entirely
        return;
      }
      // idempotent: a pointerdown for an already-tracked pointerId just re-anchors it
      if (this.activePointer) {
        this.activePointer.x = event.clientX;
        this.activePointer.y = event.clientY;
      } else {
        this.activePointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      }
    } else {
      return; // pen: not handled yet
    }

    try {
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    } catch {}
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      if (!this.touchPointer) return;
      if (this.touchPointer2) {
        const moving =
          event.pointerId === this.touchPointer.pointerId
            ? this.touchPointer
            : event.pointerId === this.touchPointer2.pointerId
              ? this.touchPointer2
              : null;
        if (!moving) return;

        // centroid (pan), pinch distance (dolly), and twist angle (rotate) all come from the same two
        // points, recomputed together on every move
        const oldCentroidX = (this.touchPointer.x + this.touchPointer2.x) / 2;
        const oldCentroidY = (this.touchPointer.y + this.touchPointer2.y) / 2;
        moving.x = event.clientX;
        moving.y = event.clientY;
        this.touchTwoDx += (this.touchPointer.x + this.touchPointer2.x) / 2 - oldCentroidX;
        this.touchTwoDy += (this.touchPointer.y + this.touchPointer2.y) / 2 - oldCentroidY;

        const distance = distanceBetween(this.touchPointer, this.touchPointer2);
        const pinchStepDelta = distance - this.touchPinchDistance;
        this.touchPinchDistance = distance;

        const angle = angleBetween(this.touchPointer, this.touchPointer2);
        const rotateStepDelta = shortestWrappedDelta(this.touchAngle, angle, [-Math.PI, Math.PI]);
        this.touchAngle = angle;
        this.touchGestureRotateTotal += rotateStepDelta;

        // decided once per gesture - a later move dominated by the other axis doesn't re-decide
        if (this.lockTouchAxis && !this.touchAxisLock) {
          const scaleFraction = distance / this.touchGestureStartDistance - 1;
          const rotateDegrees = (this.touchGestureRotateTotal * 180) / Math.PI;
          const intent = Math.abs(scaleFraction) * SCALE_ANGLE_RATIO_INTENT_DEG - Math.abs(rotateDegrees);
          if (intent < 0) this.touchAxisLock = 'rotate';
          else if (intent > 0) this.touchAxisLock = 'pinch';
        }

        if (this.touchAxisLock !== 'rotate') this.touchPinchDelta += pinchStepDelta;
        if (this.touchAxisLock !== 'pinch') this.touchRotateDelta += rotateStepDelta;
        return;
      }
      if (event.pointerId !== this.touchPointer.pointerId) return;
      this.touchOneDx += event.clientX - this.touchPointer.x;
      this.touchOneDy += event.clientY - this.touchPointer.y;
      this.touchPointer.x = event.clientX;
      this.touchPointer.y = event.clientY;
      return;
    }
    if (event.pointerType !== 'mouse') return;

    const pointer = this.activePointer;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      const locked = this.element != null && document.pointerLockElement === this.element;
      if (locked) {
        this.lockedDx += event.movementX;
        this.lockedDy += event.movementY;
      }
      return;
    }

    // marked NaN by onPointerLockChange when the lock just ended - clientX/Y were frozen at the
    // pre-lock position while locked, so this move re-anchors instead of computing a jump from it
    if (Number.isNaN(pointer.x)) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      return;
    }

    // clientX/Y freeze at 0 under Pointer Lock - movementX/Y is the only source of truth there
    const locked = this.element != null && document.pointerLockElement === this.element;
    const dx = locked ? event.movementX : event.clientX - pointer.x;
    const dy = locked ? event.movementY : event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if ((event.buttons & MouseButton.left) === MouseButton.left) {
      this.leftDx += dx;
      this.leftDy += dy;
    }
    if ((event.buttons & MouseButton.middle) === MouseButton.middle) {
      this.middleDx += dx;
      this.middleDy += dy;
    }
    if ((event.buttons & MouseButton.right) === MouseButton.right) {
      this.rightDx += dx;
      this.rightDy += dy;
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      if (this.touchPointer2?.pointerId === event.pointerId) {
        this.touchPointer2 = null;
      } else if (this.touchPointer?.pointerId === event.pointerId) {
        // promote the second finger (if any) to sole tracked finger - no jump, its position is
        // already current, a fresh one-finger drag just continues from wherever it already is
        this.touchPointer = this.touchPointer2;
        this.touchPointer2 = null;
      }
      return;
    }
    if (event.pointerType !== 'mouse') return;
    if (this.activePointer?.pointerId === event.pointerId) this.activePointer = null;
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.isInsideInteractiveArea(event.clientX, event.clientY)) return;
    event.preventDefault();
    if (event.ctrlKey) {
      // trackpad pinch, not a real scroll - deltaX is meaningless here, only deltaY carries the gesture
      this.wheelZoomDelta += event.deltaY;
    } else if (event.shiftKey && event.deltaX === 0) {
      // a single-axis wheel (most mice) reports shift+scroll through deltaY, not deltaX - a real
      // horizontal trackpad swipe already arrives as deltaX on its own and is untouched by this
      this.wheelDeltaX += event.deltaY;
    } else {
      this.wheelDeltaX += event.deltaX;
      this.wheelDeltaY += event.deltaY;
    }
  };

  private onContextMenu = (event: MouseEvent): void => {
    if (this.suppressContextMenu) event.preventDefault();
  };

  private onPointerLockChange = (): void => {
    const isLocked = this.element != null && document.pointerLockElement === this.element;
    if (this.locked && !isLocked && this.activePointer) {
      this.activePointer.x = NaN;
    }
    this.locked = isLocked;
  };

  private onPointerLockError = (): void => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('InputSystem: requestPointerLock() failed - the browser rejected the request.');
    }
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.activePointer = null;
      this.touchPointer = null;
      this.touchPointer2 = null;
      this.gestureActive = false;
    }
  };

  private onGestureStart = (event: WebKitGestureEvent): void => {
    if (!this.isInsideInteractiveArea(event.clientX, event.clientY)) return;
    if (event.cancelable) event.preventDefault();
    this.gestureActive = true;
    this.lastGestureScale = event.scale;
    this.lastGestureRotationDeg = event.rotation;
    this.gestureRotateTotalDeg = 0;
    this.gestureAxisLock = null;
  };

  private onGestureChange = (event: WebKitGestureEvent): void => {
    if (!this.gestureActive) return;
    if (event.cancelable) event.preventDefault();
    const zoomStepDelta = event.scale - this.lastGestureScale;
    const rotateStepDeg = event.rotation - this.lastGestureRotationDeg;
    this.lastGestureScale = event.scale;
    this.lastGestureRotationDeg = event.rotation;
    this.gestureRotateTotalDeg += rotateStepDeg;

    // same formula as touch's axis-intent lock, but scaleFraction is already relative to
    // gesture start (WebKit's own `scale`) and rotation never needs unwrapping (WebKit tracks it continuously)
    if (this.lockTouchAxis && !this.gestureAxisLock) {
      const scaleFraction = event.scale - 1;
      const intent = Math.abs(scaleFraction) * SCALE_ANGLE_RATIO_INTENT_DEG - Math.abs(this.gestureRotateTotalDeg);
      if (intent < 0) this.gestureAxisLock = 'rotate';
      else if (intent > 0) this.gestureAxisLock = 'pinch';
    }

    if (this.gestureAxisLock !== 'rotate') this.gestureZoomDelta += zoomStepDelta;
    if (this.gestureAxisLock !== 'pinch') this.touchRotateDelta += (rotateStepDeg * Math.PI) / 180;
  };

  private onGestureEnd = (): void => {
    this.gestureActive = false;
  };
}
