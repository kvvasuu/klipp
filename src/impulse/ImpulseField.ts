import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { Vector3 } from 'three';
import { resolveVector3 } from '../resolve/resolveVector3';

/** Shared clock value used by impulse generation and sampling. */
export type ImpulseClockSeconds = number;

/** Maps normalized impulse progress to amplitude. */
export type ImpulseShape = (t: number) => number;

/** Built-in impulse envelope shapes. */
export const ImpulseShapes = {
  recoil: (t) => (1 - t) ** 2 * (1 + 2 * t),
  bump: (t) => Math.min(1, t / 0.3) * Math.min(1, (1 - t) / 0.6),
  explosion: (t) => Math.min(1, t / 0.1) * Math.min(1, (1 - t) / 0.5),
  rumble: (t) => Math.min(1, t / 0.05) * Math.min(1, (1 - t) / 0.15),
} satisfies Record<string, ImpulseShape>;

export type GenerateImpulseOptions = {
  /** World-space origin of the event. */
  position: Vector3Like;
  /** World-space direction and peak strength of the kick. */
  direction?: Vector3Like;
  /** The envelope's amplitude curve. */
  shape?: ImpulseShape;
  /** Seconds `shape` is stretched across. */
  duration?: number;
  /** Distance from `position` within which the event is at full strength. */
  radius?: number;
  /** Distance beyond `radius` over which strength falls to zero. */
  dissipationDistance?: number;
  /** Propagation speed in world units per second. `Infinity` means no delay. */
  propagationSpeed?: number;
  /** Bitmask - a listener only reacts if `(channel & listener.channelMask) !== 0`. */
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

/** Stores one-shot impulses and samples their combined effect at a world position. */
export class ImpulseField {
  private events: ImpulseEvent[] = [];

  /** Register a new impulse event. */
  generate(options: GenerateImpulseOptions, now: ImpulseClockSeconds = defaultNow()): void {
    const duration = options.duration ?? 0.4;
    const radius = options.radius ?? 0;
    const dissipationDistance = options.dissipationDistance ?? 0;
    const propagationSpeed = options.propagationSpeed ?? Infinity;

    // Non-positive speeds mean no propagation delay.
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

  /** Write the summed offset into `outPositionOffset` and return its current strength. */
  sampleAt(
    outPositionOffset: Vector3,
    samplePosition: Vector3,
    channelMask = 1,
    gain = 1,
    now: ImpulseClockSeconds = defaultNow(),
  ): number {
    outPositionOffset.set(0, 0, 0);
    if (this.events.length === 0) return 0;

    // Prune in place to avoid allocating during sampling.
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

  /** Whether any event remains within its lifetime. */
  get hasEvents(): boolean {
    return this.events.length > 0;
  }
}

/** Shared impulse field. Create another instance for an isolated event stream. */
export const impulseField = new ImpulseField();
