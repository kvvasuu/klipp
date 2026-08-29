import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { Vector3 } from 'three';
import { resolveVector3 } from '../resolve/resolveVector3';

/** Seconds since some arbitrary but fixed origin — `performance.now() / 1000` by default (see `generate`/
 *  `sampleAt`). NOT frame `dt`: Impulse needs a clock shared between whoever triggers an event and
 *  whoever samples it later, possibly from a different `<VirtualCamera>`'s independent `update(out, dt)`
 *  loop — a per-instance `time += dt` accumulator (what `BasicMultiChannelPerlinNoise` uses) has no
 *  shared origin between two different instances, so it can't work here. */
export type ImpulseClockSeconds = number;

export type GenerateImpulseOptions = {
  /** World-space origin of the event (e.g. the explosion's position). */
  position: Vector3Like;
  /** World-space direction AND strength — the position offset at peak envelope is exactly this vector,
   *  not a separately-scaled unit direction. A bigger explosion is a bigger `direction`, not a separate
   *  "strength" field. */
  direction: Vector3Like;
  /** Envelope shape, in seconds — linear ramp up, hold, linear ramp down. Default: fast attack, brief
   *  sustain, short decay (a generic "bump"). */
  attackTime?: number;
  sustainTime?: number;
  decayTime?: number;
  /** Distance from `position` within which the event is at full strength. Default `0`. */
  radius?: number;
  /** Distance BEYOND `radius` over which strength falls off linearly to `0`. Default `0` = no falloff —
   *  full strength at any distance. */
  dissipationDistance?: number;
  /** World units/second the signal travels outward at, delaying when a distant listener feels it,
   *  sound-wave-like. Default `Infinity` = felt everywhere (within `radius + dissipationDistance`) the
   *  instant it's generated. */
  propagationSpeed?: number;
  /** Bitmask — a listener only reacts if `(channel & listener.channelMask) !== 0`. Default `1`. */
  channel?: number;
};

type ImpulseEvent = {
  position: Vector3;
  direction: Vector3;
  startTime: ImpulseClockSeconds;
  attackTime: number;
  sustainTime: number;
  decayTime: number;
  radius: number;
  dissipationDistance: number;
  propagationSpeed: number;
  channel: number;
  /** `startTime` + its full envelope/delay duration — computed once at `generate()`, since every input
   *  it depends on is already fixed by then. Lets pruning in `sampleAt` be a plain comparison against a
   *  cached number instead of re-deriving the same duration every call, for every still-live event, from
   *  every listener sampling this frame. */
  expiresAt: ImpulseClockSeconds;
};

function defaultNow(): ImpulseClockSeconds {
  return performance.now() / 1000;
}

/** `0` at `t <= 0`, ramps linearly to `1` over `attackTime`, holds `1` for `sustainTime`, ramps linearly
 *  back to `0` over `decayTime`, then stays `0`. A zero-length phase is skipped (instant transition, not
 *  a division by zero). */
function envelopeValue(t: number, attackTime: number, sustainTime: number, decayTime: number): number {
  if (t <= 0) return 0;
  if (t < attackTime) return t / attackTime;

  const afterAttack = t - attackTime;
  if (afterAttack < sustainTime) return 1;

  const decayElapsed = afterAttack - sustainTime;
  if (decayElapsed >= decayTime) return 0;
  return decayTime > 0 ? 1 - decayElapsed / decayTime : 0;
}

/** `1` within `radius`, linearly down to `0` over the next `dissipationDistance`, `0` beyond that.
 *  `dissipationDistance <= 0` disables falloff entirely (always `1`, "Uniform" impulse type). */
function distanceFalloff(distance: number, radius: number, dissipationDistance: number): number {
  if (dissipationDistance <= 0) return 1;
  if (distance <= radius) return 1;
  const t = (distance - radius) / dissipationDistance;
  return t >= 1 ? 0 : 1 - t;
}

/**
 * A registry of in-flight impulse events (`generate`) that any number of listeners can sample
 * (`sampleAt`) for the summed position offset they should currently feel. Position-only, no rotation.
 *
 * Construct your own instance, or import the shared `impulseManager` singleton that `ImpulseListenerNoise`
 * defaults to.
 */
export class ImpulseManager {
  private events: ImpulseEvent[] = [];

  /** Registers a new impulse event. `now` defaults to the real clock — pass it explicitly in tests for
   *  determinism. */
  generate(options: GenerateImpulseOptions, now: ImpulseClockSeconds = defaultNow()): void {
    const attackTime = options.attackTime ?? 0;
    const sustainTime = options.sustainTime ?? 0.05;
    const decayTime = options.decayTime ?? 0.2;
    const radius = options.radius ?? 0;
    const dissipationDistance = options.dissipationDistance ?? 0;
    const propagationSpeed = options.propagationSpeed ?? Infinity;

    const envelopeDuration = attackTime + sustainTime + decayTime;
    // propagationSpeed <= 0 (e.g. 0 itself) degrades to the same "no delay" behavior as Infinity, same as
    // dissipationDistance <= 0 degrading to "no falloff" below — dividing by it directly would otherwise
    // produce Infinity (radius/dissipationDistance > 0: the event would never expire, a permanent leak)
    // or NaN (both 0: expiresAt itself becomes NaN, pruned on the very next sampleAt before ever felt)
    const hasPropagationDelay = Number.isFinite(propagationSpeed) && propagationSpeed > 0;
    const maxDelay = hasPropagationDelay ? (radius + dissipationDistance) / propagationSpeed : 0;

    this.events.push({
      position: resolveVector3(new Vector3(), options.position),
      direction: resolveVector3(new Vector3(), options.direction),
      startTime: now,
      attackTime,
      sustainTime,
      decayTime,
      radius,
      dissipationDistance,
      propagationSpeed,
      channel: options.channel ?? 1,
      expiresAt: now + envelopeDuration + maxDelay,
    });
  }

  /** Writes the summed position offset from every still-active event visible to `channelMask`, felt at
   *  `position` at time `now`, into `out` — same zero-allocation `out`-parameter convention as the rest
   *  of klipp. Also prunes events no listener could possibly still feel. Returns `out`. */
  sampleAt(out: Vector3, position: Vector3, channelMask = 1, now: ImpulseClockSeconds = defaultNow()): Vector3 {
    out.set(0, 0, 0);
    if (this.events.length === 0) return out;

    // prune in place — .filter() would allocate a new array every call, for as long as ANY event is in
    // flight, from every listener sampling this frame (this runs once per <ImpulseListener> per frame)
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.events.length; readIndex++) {
      const event = this.events[readIndex];
      if (now <= event.expiresAt) this.events[writeIndex++] = event;
    }
    this.events.length = writeIndex;

    for (const event of this.events) {
      if ((event.channel & channelMask) === 0) continue;

      const distance = position.distanceTo(event.position);
      const hasPropagationDelay = Number.isFinite(event.propagationSpeed) && event.propagationSpeed > 0;
      const delay = hasPropagationDelay ? distance / event.propagationSpeed : 0;
      const localTime = now - event.startTime - delay;

      const amplitude =
        envelopeValue(localTime, event.attackTime, event.sustainTime, event.decayTime) *
        distanceFalloff(distance, event.radius, event.dissipationDistance);
      if (amplitude > 0) out.addScaledVector(event.direction, amplitude);
    }

    return out;
  }

  /** Whether any event is still within its lifetime, as of the last `sampleAt`/`generate` call — cheap
   *  enough to check every frame. Doesn't filter by `channelMask`: a listener on a channel with nothing
   *  happening on it may see `true` because of an event on a DIFFERENT channel, which only costs a few
   *  extra idle frames, never a missed one. */
  get hasEvents(): boolean {
    return this.events.length > 0;
  }
}

/** Shared, ready-to-use instance. Construct your own `new ImpulseManager()` instead only if you need
 *  fully isolated impulse "worlds" (e.g. split-screen with independent explosions per view). */
export const impulseManager = new ImpulseManager();
