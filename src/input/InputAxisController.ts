import { InputAxis } from './InputAxis';
import { createConsumedInput, InputSystem, type ConsumedInput } from './InputSystem';

export type InputAxisPair = {
  x: InputAxis;
  y: InputAxis;
};

/** `true`/`false` flips both axes at once; `{x, y}` flips them independently */
export type InputInvert = boolean | { x?: boolean; y?: boolean };

export type InputSourceMapping = {
  axes: InputAxisPair;
  /** Multiplies the raw delta before it reaches the axes. Default 1. */
  gain?: number;
  /** Default false (neither axis inverted). */
  invert?: InputInvert;
};

export type InputAxisControllerConfig = {
  mouseButtons: {
    left: InputSourceMapping | null;
    right: InputSourceMapping | null;
    middle: InputSourceMapping | null;
  };
  touches: {
    one: InputSourceMapping | null;
    two: InputSourceMapping | null;
    three: InputSourceMapping | null;
  };
};

/**
 * Maps `InputSystem`'s raw, per-source buffers onto named `InputAxis` pairs.
 */
export class InputAxisController {
  readonly inputSystem = new InputSystem();
  config: InputAxisControllerConfig;

  /* This frame's drained values - read-only outside this class.
   *  Overwritten in place on every `update()` call. */
  readonly lastInput: ConsumedInput = createConsumedInput();

  constructor(config: InputAxisControllerConfig) {
    this.config = config;
  }

  connect = (element: HTMLElement): void => {
    this.inputSystem.connect(element);
  };

  disconnect = (): void => {
    this.inputSystem.disconnect();
  };

  /** Drains `InputSystem` and feeds every configured source's shaped delta into its `InputAxis` pair. */
  update = (): void => {
    const input = this.inputSystem.consume(this.lastInput);
    this.applySource(this.config.mouseButtons.left, input.leftDx, input.leftDy);
    this.applySource(this.config.mouseButtons.right, input.rightDx, input.rightDy);
    this.applySource(this.config.mouseButtons.middle, input.middleDx, input.middleDy);
    this.applySource(this.config.touches.one, input.touchOneDx, input.touchOneDy);
    this.applySource(this.config.touches.two, input.touchTwoDx, input.touchTwoDy);
    this.applySource(this.config.touches.three, input.touchThreeDx, input.touchThreeDy);
    this.applySource(this.config.mouseButtons.left, input.lockedDx, input.lockedDy);
  };

  private applySource(mapping: InputSourceMapping | null, dx: number, dy: number): void {
    if (!mapping || (dx === 0 && dy === 0)) return;
    const gain = mapping.gain ?? 1;
    mapping.axes.x.applyDelta(dx * gain * (isInverted(mapping.invert, 'x') ? -1 : 1));
    mapping.axes.y.applyDelta(dy * gain * (isInverted(mapping.invert, 'y') ? -1 : 1));
  }
}

function isInverted(invert: InputInvert | undefined, axis: 'x' | 'y'): boolean {
  return invert === true || (typeof invert === 'object' && !!invert[axis]);
}
