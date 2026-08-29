import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { impulseManager, type ImpulseManager } from './ImpulseManager';

const scratchOffset = new Vector3();

/** Additive position offset from in-flight impulse events (explosions, footsteps, anything that calls
 *  `manager.generate(...)`) — position-only, no rotation. `manager` defaults to the shared `impulseManager`
 *  singleton — pass your own instance only for isolated impulse "worlds" (e.g. split-screen). */
export class ImpulseListenerNoise {
  manager: ImpulseManager;
  channelMask: number;
  gain: number;

  constructor(manager: ImpulseManager = impulseManager, channelMask = 1, gain = 1) {
    this.manager = manager;
    this.channelMask = channelMask;
    this.gain = gain;
  }

  /** `now` (seconds, same clock as `ImpulseManager.generate`/`sampleAt` — real time by default) is a
   *  4th, optional param, NOT `dt` — `registerNoise` never passes it, so production code gets the real
   *  clock automatically; tests pass it explicitly for determinism instead of depending on wall time.
   *  `justActivated` doesn't apply here — an impulse offset has no persistent damping state to snap, it's
   *  freshly sampled from `manager` every call, same "no state between frames" shape as
   *  `BasicMultiChannelPerlinNoise`.
   *
   *  Returns whether `manager` still has an event in flight — an event's constant-amplitude sustain
   *  phase can hold the exact same offset across several frames without being done, so klipp can't infer
   *  "settled" from this frame's output alone (see `CameraStateWriter` in `VirtualCameraController.ts`). */
  update = (out: CameraState, _dt: number, _justActivated: boolean, now?: number): boolean => {
    this.manager.sampleAt(scratchOffset, out.position, this.channelMask, now);
    out.position.addScaledVector(scratchOffset, this.gain);
    return this.manager.hasEvents;
  };
}
