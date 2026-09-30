/** Input gathered since the last frame, as plain numbers. */
export type ConsumedInput = {
  leftDx: number;
  leftDy: number;
  middleDx: number;
  middleDy: number;
  rightDx: number;
  rightDy: number;
  /** Single-finger touch movement. */
  touchOneDx: number;
  touchOneDy: number;
  /** Two-finger centroid movement. */
  touchTwoDx: number;
  touchTwoDy: number;
  /** Two-finger distance change. */
  touchPinchDelta: number;
  /** Three-finger centroid movement. */
  touchThreeDx: number;
  touchThreeDy: number;
  /** Two-finger twist in radians. */
  touchRotateDelta: number;
  /** Safari/WebKit trackpad pinch amount. */
  gestureZoomDelta: number;
  wheelDeltaX: number;
  wheelDeltaY: number;
  /** Trackpad pinch amount reported through `wheel`. */
  wheelZoomDelta: number;
  /** Raw mouse movement while Pointer Lock is active and no button is held. */
  lockedDx: number;
  lockedDy: number;
  /** Current hold state for the source. */
  leftHeld: boolean;
  middleHeld: boolean;
  rightHeld: boolean;
  touchOneHeld: boolean;
  touchTwoHeld: boolean;
  touchThreeHeld: boolean;
};

/** Reusable zero-valued input buffer. */
export function createConsumedInput(): ConsumedInput {
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
    touchThreeDx: 0,
    touchThreeDy: 0,
    touchPinchDelta: 0,
    touchRotateDelta: 0,
    gestureZoomDelta: 0,
    wheelDeltaX: 0,
    wheelDeltaY: 0,
    wheelZoomDelta: 0,
    lockedDx: 0,
    lockedDy: 0,
    leftHeld: false,
    middleHeld: false,
    rightHeld: false,
    touchOneHeld: false,
    touchTwoHeld: false,
    touchThreeHeld: false,
  };
}
