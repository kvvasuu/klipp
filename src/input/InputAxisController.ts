import { InputAxis } from './InputAxis';
import { createConsumedInput, InputSystem, type ConsumedInput } from './InputSystem';

export type InputAxisPair = {
  x: InputAxis;
  y: InputAxis;
};

/** Inverts both axes or configures them independently. */
export type InputInvert = boolean | { x?: boolean; y?: boolean };

export type InputSourceMapping = {
  axes: InputAxisPair;
  /** Multiplies the raw delta before it reaches the axes. */
  gain?: number;
  /** Whether either axis is inverted. */
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

/** Maps raw input buffers onto named axis pairs. */
export class InputAxisController {
  readonly inputSystem = new InputSystem();
  config: InputAxisControllerConfig;
  /** Whether input deltas are applied to the configured axes. */
  enabled = true;

  /* Reused values drained from the input system each frame. */
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
    // Reset held state first so shared mappings can combine multiple sources.
    this.resetHeld(this.config.mouseButtons.left);
    this.resetHeld(this.config.mouseButtons.right);
    this.resetHeld(this.config.mouseButtons.middle);
    this.resetHeld(this.config.touches.one);
    this.resetHeld(this.config.touches.two);
    this.resetHeld(this.config.touches.three);
    if (!this.enabled) return;
    this.applySource(this.config.mouseButtons.left, input.leftDx, input.leftDy);
    this.applySource(this.config.mouseButtons.right, input.rightDx, input.rightDy);
    this.applySource(this.config.mouseButtons.middle, input.middleDx, input.middleDy);
    this.applySource(this.config.touches.one, input.touchOneDx, input.touchOneDy);
    this.applySource(this.config.touches.two, input.touchTwoDx, input.touchTwoDy);
    this.applySource(this.config.touches.three, input.touchThreeDx, input.touchThreeDy);
    this.applySource(this.config.mouseButtons.left, input.lockedDx, input.lockedDy);
    this.applyHeld(this.config.mouseButtons.left, input.leftHeld);
    this.applyHeld(this.config.mouseButtons.right, input.rightHeld);
    this.applyHeld(this.config.mouseButtons.middle, input.middleHeld);
    this.applyHeld(this.config.touches.one, input.touchOneHeld);
    this.applyHeld(this.config.touches.two, input.touchTwoHeld);
    this.applyHeld(this.config.touches.three, input.touchThreeHeld);
  };

  private applySource(mapping: InputSourceMapping | null, dx: number, dy: number): void {
    if (!mapping || (dx === 0 && dy === 0)) return;
    const gain = mapping.gain ?? 1;
    mapping.axes.x.applyDelta(dx * gain * (isInverted(mapping.invert, 'x') ? -1 : 1));
    mapping.axes.y.applyDelta(dy * gain * (isInverted(mapping.invert, 'y') ? -1 : 1));
  }

  private resetHeld(mapping: InputSourceMapping | null): void {
    if (!mapping) return;
    mapping.axes.x.held = false;
    mapping.axes.y.held = false;
  }

  private applyHeld(mapping: InputSourceMapping | null, held: boolean): void {
    if (!mapping || !held) return;
    mapping.axes.x.held = true;
    mapping.axes.y.held = true;
  }
}

function isInverted(invert: InputInvert | undefined, axis: 'x' | 'y'): boolean {
  return invert === true || (typeof invert === 'object' && !!invert[axis]);
}
