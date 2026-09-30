import type { CameraState } from '../CameraState';
import { blendTargetId, createBlendState, setBlendTarget, tickBlend, type BlendState } from '../blend/blend';
import { BlendCurves } from '../blend/BlendCurves';
import type { BlendDefinition } from '../blend/BlendDefinition';

export type SequencerInstruction = {
  cameraId: string;
  /** Live reference - `Sequencer` reads it directly, same convention as `KlippCore.registerCamera`. */
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

export type SequencerParams = {
  instructions: readonly SequencerInstruction[];
  defaultBlend: BlendDefinition;
  loop: boolean;
};

export type SequencerState = { holdElapsed: number; blend: BlendState<number> };

export const createSequencerState = (): SequencerState => ({ holdElapsed: 0, blend: createBlendState<number>() });

/** The settled instruction; during a blend, still the one being left. `0` before the first tick. */
export const sequencerIndex = (state: SequencerState): number => state.blend.liveId ?? 0;

function instructionState(params: SequencerParams, index: number | null): CameraState | null {
  return index !== null ? params.instructions[index].state : null;
}

/** Advances the sequence by `dt` and returns the composited output. */
export function tickSequencer(state: SequencerState, params: SequencerParams, dt: number): CameraState {
  const { blend } = state;
  if (blendTargetId(blend) === null) {
    // First tick: snap to instruction 0 without starting the hold timer.
    setBlendTarget(blend, 0, params.instructions[0].state, params.defaultBlend);
    return tickBlend(blend, 0, instructionState(params, blendTargetId(blend)));
  }

  // Checked before ticking: the tick a blend lands on still does not count toward the next hold.
  const wasBlending = blend.transition.active;
  const result = tickBlend(blend, dt, instructionState(params, blendTargetId(blend)));
  if (wasBlending) return result;

  const index = sequencerIndex(state);
  const isLast = index === params.instructions.length - 1;
  if (isLast && !params.loop) return result;

  state.holdElapsed += dt;
  if (state.holdElapsed >= params.instructions[index].hold) {
    const nextIndex = isLast ? 0 : index + 1;
    state.holdElapsed = 0;
    const definition = params.instructions[index].blend ?? params.defaultBlend;
    setBlendTarget(blend, nextIndex, params.instructions[nextIndex].state, definition);
  }

  return result;
}

/**
 * Steps through a fixed list of camera instructions in order, holding each for its own duration before
 * blending to the next. Holds the last instruction forever once reached, unless `loop`.
 */
export class Sequencer {
  readonly state = createSequencerState();
  private readonly params: SequencerParams;

  constructor(instructions: SequencerInstruction[], options: SequencerOptions = {}) {
    if (instructions.length === 0) throw new Error('Sequencer needs at least one instruction.');
    this.params = {
      instructions,
      defaultBlend: options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 },
      loop: options.loop ?? false,
    };
  }

  /** The settled instruction; during a blend, still the one being left. `0` before the first tick. */
  get currentIndex(): number {
    return sequencerIndex(this.state);
  }

  get currentCameraId(): string {
    return this.params.instructions[this.currentIndex].cameraId;
  }

  get isBlending(): boolean {
    return this.state.blend.transition.active;
  }

  /** Advances by `dt` and returns the composited `CameraState` - same scratch instance every call. */
  tick(dt: number): CameraState {
    return tickSequencer(this.state, this.params, dt);
  }
}
