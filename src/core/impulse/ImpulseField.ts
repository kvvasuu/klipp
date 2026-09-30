import type { Vec3 } from 'math';
import {
  createImpulseFieldState,
  generateImpulse,
  impulseNow,
  sampleImpulses,
  type GenerateImpulseOptions,
  type ImpulseClockSeconds,
} from './impulses.js';

/** Stores one-shot impulses and samples their combined effect at a world position. */
export class ImpulseField {
  readonly state = createImpulseFieldState();

  /** Register a new impulse event. */
  generate(options: GenerateImpulseOptions, now: ImpulseClockSeconds = impulseNow()): void {
    generateImpulse(this.state, options, now);
  }

  /** Write the summed offset into `outPositionOffset` and return its current strength. */
  sampleAt(
    outPositionOffset: Vec3,
    samplePosition: Vec3,
    channelMask = 1,
    gain = 1,
    now: ImpulseClockSeconds = impulseNow(),
  ): number {
    return sampleImpulses(outPositionOffset, this.state, samplePosition, channelMask, gain, now);
  }

  /** Whether any event remains within its lifetime. */
  get hasEvents(): boolean {
    return this.state.events.length > 0;
  }
}

/** Shared impulse field. Create another instance for an isolated event stream. */
export const impulseField = new ImpulseField();
