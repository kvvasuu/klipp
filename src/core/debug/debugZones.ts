import { clamp, degreesToRadians } from 'math';
import { horizontalHalfFov, type GroupFramingMode } from '../extension/groupFraming.js';

export type DebugZone = {
  /** Zone center in normalized screen coordinates. */
  screenPosition: [number, number];
  /** Zone width and height. */
  size: [number, number];
  /** CSS class applied to the zone. */
  className: string;
};

/** A composer's hard limit and dead zone as boxes. Both are half-extents around `screenPosition`. */
export function composerDebugZones(
  screenPosition: [number, number],
  deadZone: [number, number],
  hardLimit: [number, number],
): DebugZone[] {
  const zones: DebugZone[] = [];
  if (hardLimit[0] > 0 || hardLimit[1] > 0) {
    zones.push({ screenPosition, size: [hardLimit[0] * 2, hardLimit[1] * 2], className: 'klipp-debug-hardlimit' });
  }
  if (deadZone[0] > 0 || deadZone[1] > 0) {
    zones.push({ screenPosition, size: [deadZone[0] * 2, deadZone[1] * 2], className: 'klipp-debug-deadzone' });
  }
  return zones;
}

// Use the frustum plane distance for a padded box.
function paddingEdgeFraction(halfFov: number, distance: number, padding: number): number {
  return clamp(1 - padding / (distance * Math.sin(halfFov)), 0, 1);
}

/**
 * Size of group framing's padding boundary on screen, for a group `distance` away. An axis left out by
 * `framingMode` spans the full frame.
 */
export function groupFramingPaddingBox(
  out: [number, number],
  fov: number,
  aspect: number,
  distance: number,
  padding: number,
  framingMode: GroupFramingMode,
): [number, number] {
  const verticalHalfFov = degreesToRadians(fov) / 2;
  out[0] =
    framingMode === 'vertical'
      ? 2
      : paddingEdgeFraction(horizontalHalfFov(verticalHalfFov, aspect), distance, padding) * 2;
  out[1] = framingMode === 'horizontal' ? 2 : paddingEdgeFraction(verticalHalfFov, distance, padding) * 2;
  return out;
}
