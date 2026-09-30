import { smoothstep, vec3, type Vec3 } from 'math';

/** Shared clock value used by impulse generation and sampling. */
export type ImpulseClockSeconds = number;

/** Maps normalized impulse progress to amplitude. */
export type ImpulseShape = (t: number) => number;

/** Built-in impulse envelope shapes. */
export const ImpulseShapes = {
  recoil: (t) => 1 - smoothstep(0, 1, t),
  bump: (t) => Math.min(1, t / 0.3) * Math.min(1, (1 - t) / 0.6),
  explosion: (t) => Math.min(1, t / 0.1) * Math.min(1, (1 - t) / 0.5),
  rumble: (t) => Math.min(1, t / 0.05) * Math.min(1, (1 - t) / 0.15),
} satisfies Record<string, ImpulseShape>;

export type GenerateImpulseOptions = {
  /** World-space origin of the event. */
  position: Vec3;
  /** World-space direction and peak strength of the kick. */
  direction?: Vec3;
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

export type ImpulseEvent = {
  position: Vec3;
  direction: Vec3;
  startTime: ImpulseClockSeconds;
  shape: ImpulseShape;
  duration: number;
  radius: number;
  dissipationDistance: number;
  propagationSpeed: number;
  channel: number;
  expiresAt: ImpulseClockSeconds;
};

export type ImpulseFieldState = { events: ImpulseEvent[] };

export const createImpulseFieldState = (): ImpulseFieldState => ({ events: [] });

/** The default impulse clock, in seconds. */
export const impulseNow = (): ImpulseClockSeconds => performance.now() / 1000;

function distanceFalloff(distance: number, radius: number, dissipationDistance: number): number {
  if (dissipationDistance <= 0) return 1;
  if (distance <= radius) return 1;
  const t = (distance - radius) / dissipationDistance;
  return t >= 1 ? 0 : 1 - t;
}

/** Drop expired events in place, without allocating. */
export function pruneImpulses(state: ImpulseFieldState, now: ImpulseClockSeconds): void {
  const { events } = state;
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < events.length; readIndex++) {
    const event = events[readIndex];
    if (now <= event.expiresAt) events[writeIndex++] = event;
  }
  events.length = writeIndex;
}

/** Register a new impulse event. */
export function generateImpulse(
  state: ImpulseFieldState,
  options: GenerateImpulseOptions,
  now: ImpulseClockSeconds,
): void {
  // Sampling only runs while a listener is active, so prune here too.
  pruneImpulses(state, now);
  const duration = options.duration ?? 0.4;
  const radius = options.radius ?? 0;
  const dissipationDistance = options.dissipationDistance ?? 0;
  const propagationSpeed = options.propagationSpeed ?? Infinity;

  // Non-positive speeds mean no propagation delay.
  const hasPropagationDelay = Number.isFinite(propagationSpeed) && propagationSpeed > 0;
  const maxDelay = hasPropagationDelay ? (radius + dissipationDistance) / propagationSpeed : 0;

  state.events.push({
    position: vec3.clone(options.position),
    direction: options.direction ? vec3.clone(options.direction) : [0, 0, 0],
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

/** Write the summed offset at `samplePosition` into `outPositionOffset` and return its current strength. */
export function sampleImpulses(
  outPositionOffset: Vec3,
  state: ImpulseFieldState,
  samplePosition: Vec3,
  channelMask: number,
  gain: number,
  now: ImpulseClockSeconds,
): number {
  vec3.set(outPositionOffset, 0, 0, 0);
  if (state.events.length === 0) return 0;

  pruneImpulses(state, now);

  let strength = 0;
  for (const event of state.events) {
    if ((event.channel & channelMask) === 0) continue;

    const distance = vec3.distance(samplePosition, event.position);
    const hasPropagationDelay = Number.isFinite(event.propagationSpeed) && event.propagationSpeed > 0;
    const delay = hasPropagationDelay ? distance / event.propagationSpeed : 0;
    const localTime = now - event.startTime - delay;
    const t = event.duration > 0 ? localTime / event.duration : -1;
    if (t < 0 || t > 1) continue;

    const amplitude = event.shape(t) * distanceFalloff(distance, event.radius, event.dissipationDistance) * gain;
    if (amplitude <= 0) continue;

    vec3.scaleAndAdd(outPositionOffset, outPositionOffset, event.direction, amplitude);
    strength += amplitude;
  }

  return strength;
}
