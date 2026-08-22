import { clamp } from 'maath';
import { copyCameraState, createCameraState, type CameraState } from '../CameraState';
import { BlendCurves } from '../blend/BlendCurves';
import type { BlendDefinition } from '../blend/BlendDefinition';
import { lerpCameraState } from '../blend/lerpCameraState';

export type SequencerInstruction = {
  cameraId: string;
  /** Live reference — `Sequencer` reads it directly, same convention as `KlippCore.registerCamera`. */
  state: CameraState;
  /** Seconds to hold this camera before advancing. Ignored on the last instruction unless `loop`. */
  hold: number;
  /** Transition into the NEXT instruction. Falls back to `defaultBlend` if omitted. */
  blend?: BlendDefinition;
};

export type SequencerOptions = {
  defaultBlend?: BlendDefinition;
  /** Wrap to the first instruction after the last one's hold elapses, instead of holding forever. */
  loop?: boolean;
};

type ActiveBlend = {
  from: CameraState;
  toIndex: number;
  definition: BlendDefinition;
  elapsed: number;
};

/**
 * Steps through a fixed list of camera instructions in order, holding each for its own duration before
 * blending to the next. Holds the last instruction forever once reached, unless `loop` — never ends
 * itself.
 */
export class Sequencer {
  private readonly instructions: SequencerInstruction[];
  private readonly defaultBlend: BlendDefinition;
  private readonly loop: boolean;

  private index = 0;
  private holdElapsed = 0;
  private blend: ActiveBlend | null = null;
  private started = false;

  private readonly output: CameraState = createCameraState();
  private readonly blendFromScratch: CameraState = createCameraState();

  constructor(instructions: SequencerInstruction[], options: SequencerOptions = {}) {
    if (instructions.length === 0) throw new Error('Sequencer needs at least one instruction.');
    this.instructions = instructions;
    this.defaultBlend = options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 };
    this.loop = options.loop ?? false;
  }

  get currentIndex(): number {
    return this.index;
  }

  get currentCameraId(): string {
    return this.instructions[this.index].cameraId;
  }

  get isBlending(): boolean {
    return this.blend !== null;
  }

  /** Advances by `dt` and returns the composited `CameraState` — same scratch instance every call. */
  tick(dt: number): CameraState {
    if (!this.started) {
      this.started = true;
      copyCameraState(this.output, this.instructions[this.index].state);
      return this.output;
    }

    if (this.blend) {
      this.blend.elapsed += dt;
      const t = this.blend.definition.time <= 0 ? 1 : clamp(this.blend.elapsed / this.blend.definition.time, 0, 1);
      const toState = this.instructions[this.blend.toIndex].state;
      lerpCameraState(this.output, this.blend.from, toState, this.blend.definition.curve(t));

      if (t >= 1) {
        this.index = this.blend.toIndex;
        this.holdElapsed = 0;
        this.blend = null;
      }
      return this.output;
    }

    copyCameraState(this.output, this.instructions[this.index].state);

    const isLast = this.index === this.instructions.length - 1;
    if (isLast && !this.loop) return this.output;

    this.holdElapsed += dt;
    if (this.holdElapsed >= this.instructions[this.index].hold) {
      const nextIndex = isLast ? 0 : this.index + 1;
      copyCameraState(this.blendFromScratch, this.output);
      this.blend = {
        from: this.blendFromScratch,
        toIndex: nextIndex,
        definition: this.instructions[this.index].blend ?? this.defaultBlend,
        elapsed: 0,
      };
    }

    return this.output;
  }
}
