import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { Vector3 } from 'three';
import { resolveVector3 } from '../resolve/resolveVector3';

/** Seconds since some arbitrary but fixed origin - `performance.now() / 1000` by default (see `generate`/
 *  `sampleAt`). NOT frame `dt`: Impulse needs a clock shared between whoever triggers an event and
 *  whoever samples it later, possibly from a different `<VirtualCamera>`'s independent `update(out, dt)`
 *  loop - a per-instance `time += dt` accumulator has no shared origin between two different instances. */
export type ImpulseClockSeconds = number;

/** An impulse envelope: normalized progress `t` (0..1 over `duration`) in, amplitude out. Named ones live
 *  on `ImpulseShapes`; pass your own for anything else. */
export type ImpulseShape = (t: number) => number;

/** Named envelope shapes - pass your own `ImpulseShape` for anything else. `recoil` peaks instantly and
 *  eases down; `bump`/`explosion`/`rumble` rise then fall, holding near full strength longer for each
 *  bigger, longer-feeling preset. */
export const ImpulseShapes = {
  recoil: (t) => (1 - t) ** 2 * (1 + 2 * t),
  bump: (t) => Math.min(1, t / 0.3) * Math.min(1, (1 - t) / 0.6),
  explosion: (t) => Math.min(1, t / 0.1) * Math.min(1, (1 - t) / 0.5),
  rumble: (t) => Math.min(1, t / 0.05) * Math.min(1, (1 - t) / 0.15),
} satisfies Record<string, ImpulseShape>;

export type GenerateImpulseOptions = {
  /** World-space origin of the event (e.g. the explosion's position). */
  position: Vector3Like;
  /** World-space direction AND strength of the kick - the offset at peak envelope is exactly this vector,
   *  not a separately-scaled unit direction. Default `[0, 0, 0]`. */
  direction?: Vector3Like;
  /** The envelope's amplitude curve. Default `ImpulseShapes.bump`. */
  shape?: ImpulseShape;
  /** Seconds `shape` is stretched across. Default `0.4`. */
  duration?: number;
  /** Distance from `position` within which the event is at full strength. Default `0`. */
  radius?: number;
  /** Distance BEYOND `radius` over which strength falls off linearly to `0`. Default `0` = no falloff -
   *  full strength at any distance. */
  dissipationDistance?: number;
  /** World units/second the signal travels outward at, sound-wave-like. Default `Infinity` = felt
   *  everywhere instantly. */
  propagationSpeed?: number;
  /** Bitmask - a listener only reacts if `(channel & listener.channelMask) !== 0`. Default `1`. */
  channel?: number;
};

type ImpulseEvent = {
  position: Vector3;
  direction: Vector3;
  startTime: ImpulseClockSeconds;
  shape: ImpulseShape;
  duration: number;
  radius: number;
  dissipationDistance: number;
  propagationSpeed: number;
  channel: number;
  /** `startTime` + its full envelope/delay duration - cached at `generate()` so pruning in `sampleAt` is
   *  a plain comparison, not a re-derivation every call, for every event, every listener, every frame. */
  expiresAt: ImpulseClockSeconds;
};

function defaultNow(): ImpulseClockSeconds {
  return performance.now() / 1000;
}

function distanceFalloff(distance: number, radius: number, dissipationDistance: number): number {
  if (dissipationDistance <= 0) return 1;
  if (distance <= radius) return 1;
  const t = (distance - radius) / dissipationDistance;
  return t >= 1 ? 0 : 1 - t;
}

/**
 * A registry of in-flight, one-shot impulse events (`generate`) - explosions, footsteps, impacts -
 * sampled (`sampleAt`) as the combined position offset AND felt strength at a given point in space.
 * Continuous shake (a persistent rattle, not a decaying event) is a different concern, owned by
 * `BasicMultiChannelPerlinNoise` - `ImpulseListenerNoise.shake` composes the two.
 *
 * Construct your own instance, or import the shared `impulseField` singleton.
 */
export class ImpulseField {
  private events: ImpulseEvent[] = [];

  /** Registers a new impulse event. `now` defaults to the real clock - pass it explicitly in tests for
   *  determinism. */
  generate(options: GenerateImpulseOptions, now: ImpulseClockSeconds = defaultNow()): void {
    const duration = options.duration ?? 0.4;
    const radius = options.radius ?? 0;
    const dissipationDistance = options.dissipationDistance ?? 0;
    const propagationSpeed = options.propagationSpeed ?? Infinity;

    // propagationSpeed <= 0 degrades to "no delay" instead of dividing by it directly, which would
    // produce Infinity (a permanent leak) or NaN (an instant, premature prune)
    const hasPropagationDelay = Number.isFinite(propagationSpeed) && propagationSpeed > 0;
    const maxDelay = hasPropagationDelay ? (radius + dissipationDistance) / propagationSpeed : 0;

    this.events.push({
      position: resolveVector3(new Vector3(), options.position),
      direction: resolveVector3(new Vector3(), options.direction ?? [0, 0, 0]),
      startTime: now,
      shape: options.shape ?? ImpulseShapes.bump,
      duration,
      radius,
      dissipationDistance,
      propagationSpeed,
      channel: options.channel ?? 1,
      expiresAt: now + duration + maxDelay,
    });
  }

  /** Writes the summed position offset felt at `samplePosition` into `outPositionOffset`. Also prunes
   *  events no listener could possibly still feel. Returns the combined strength felt right now (post-
   *  `gain`, summed across overlapping events) - drives `ImpulseListenerNoise.shake`'s amplitude. */
  sampleAt(
    outPositionOffset: Vector3,
    samplePosition: Vector3,
    channelMask = 1,
    gain = 1,
    now: ImpulseClockSeconds = defaultNow(),
  ): number {
    outPositionOffset.set(0, 0, 0);
    if (this.events.length === 0) return 0;

    // prune in place - .filter() would allocate a new array every call, for as long as ANY event is in
    // flight, from every listener sampling this frame (this runs once per <ImpulseListener> per frame)
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.events.length; readIndex++) {
      const event = this.events[readIndex];
      if (now <= event.expiresAt) this.events[writeIndex++] = event;
    }
    this.events.length = writeIndex;

    let strength = 0;
    for (const event of this.events) {
      if ((event.channel & channelMask) === 0) continue;

      const distance = samplePosition.distanceTo(event.position);
      const hasPropagationDelay = Number.isFinite(event.propagationSpeed) && event.propagationSpeed > 0;
      const delay = hasPropagationDelay ? distance / event.propagationSpeed : 0;
      const localTime = now - event.startTime - delay;
      const t = event.duration > 0 ? localTime / event.duration : -1;
      if (t < 0 || t > 1) continue;

      const amplitude = event.shape(t) * distanceFalloff(distance, event.radius, event.dissipationDistance) * gain;
      if (amplitude <= 0) continue;

      outPositionOffset.addScaledVector(event.direction, amplitude);
      strength += amplitude;
    }

    return strength;
  }

  /** Whether any event is still within its lifetime - cheap enough to check every frame. Ignores
   *  `channelMask`: a listener may see `true` from an event on a different channel, costing a few idle
   *  frames, never a missed one. */
  get hasEvents(): boolean {
    return this.events.length > 0;
  }
}

/** Shared, ready-to-use instance. Construct your own `new ImpulseField()` instead only if you need fully
 *  isolated impulse "worlds" (e.g. split-screen with independent explosions per view). */
export const impulseField = new ImpulseField();
