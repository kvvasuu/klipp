import { degreesToRadians } from 'maath';
import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';
import type { TargetGroup } from './TargetGroup';

const scratchGroupPosition = new Vector3();
/** THREE cameras look down their own local -Z — this rotated into world space is "away from what
 *  the camera is looking at", i.e. the direction to dolly back along. */
const scratchBackward = new Vector3();

/**
 * Camera extension: dollies `out.position` straight back along the camera's OWN current view axis so
 * `group`'s bounding sphere stays fully framed with `paddingPixels` of margin on every side, at the
 * current `viewportWidth`/`viewportHeight`; separately, `centerOffsetX`/`Y` shift `out.viewOffsetX`/`Y`
 * (screen pixels, via `camera.setViewOffset` — a frustum shift, not a move). Never touches
 * `out.quaternion`/`out.fov` — this is "Dolly Only" framing, so it only works correctly when Aim already
 * looks straight at `group`'s own position (its sightline is the axis this dollies along); it does
 * nothing on its own to keep the group centered if Aim looks elsewhere.
 *
 * `update()` returns whether distance/center offset are still catching up to their targets — see
 * `CameraStateWriter` in `VirtualCameraController.ts` for why that matters, and
 * `useIsVirtualCameraSettled` for reading it.
 */
export class GroupFramingExtension {
  group: TargetGroup;
  /** Margin kept clear on every side, in screen pixels — same on all four edges. */
  paddingPixels: number;
  /** Current canvas size in pixels — the React wrapper feeds this from `useThree(state => state.size)`,
   *  since converting a PIXEL padding into an angular one needs to know the actual viewport. */
  viewportWidth: number;
  viewportHeight: number;
  /** Seconds to catch up to the fitted distance as `group`'s bounds change (or `{into, from}` for
   *  asymmetric damping — see `DampingConstant`). `0` (default) = hard, instant fit. Also governs
   *  `centerOffsetX`/`centerOffsetY`'s transitions — one shared knob, since a discontinuous offset jump
   *  while distance eases in would read as inconsistent. */
  damping: DampingConstant;
  /** Shifts the frustum (`out.viewOffsetX`/`Y`, screen pixels) without moving or rotating the camera,
   *  e.g. to keep the framed group visually centered in the space left over after reserving room for UI
   *  on one side. `0` (default) = no shift. */
  centerOffsetX: number;
  centerOffsetY: number;

  // damps the SCALAR distance, never the 3D position — dollying always lands exactly on
  // groupPosition + backward(out.quaternion)*currentDistance using THIS frame's rotation, so the target
  // stays perfectly centered throughout a transition no matter how far the distance still has to travel.
  // Damping full position (like a Body would) instead breaks that: if the camera's rotation is ALSO
  // transitioning (e.g. an OrbitalFollow azimuth blend), the position damper chases a target that moves
  // every frame and lags behind it, landing off the "look straight at group" ray — briefly aimed
  // somewhere else entirely before catching up, not just closer/farther along the correct line.
  private readonly distanceDamper = new Damper();
  private currentDistance = 0;
  private readonly centerOffsetXDamper = new Damper();
  private readonly centerOffsetYDamper = new Damper();
  private currentCenterOffsetX = 0;
  private currentCenterOffsetY = 0;

  constructor(
    group: TargetGroup,
    paddingPixels = 0,
    viewportWidth = 1,
    viewportHeight = 1,
    damping: DampingConstant = 0,
    centerOffsetX = 0,
    centerOffsetY = 0,
  ) {
    this.group = group;
    this.paddingPixels = paddingPixels;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.damping = damping;
    this.centerOffsetX = centerOffsetX;
    this.centerOffsetY = centerOffsetY;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    const radius = this.group.computeBounds(scratchGroupPosition);
    if (radius <= 0) return false;

    const verticalHalfFov = degreesToRadians(out.fov) / 2;
    const aspect = this.viewportWidth / this.viewportHeight;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);

    // a pixel margin is a FRACTION of the viewport on each side — scale the corresponding half-FOV's
    // tangent by "how much of that axis is left after both margins" to get the narrower, effective FOV
    // the group actually has to fit inside
    const availableVertical = Math.max(0, 1 - (2 * this.paddingPixels) / this.viewportHeight);
    const availableHorizontal = Math.max(0, 1 - (2 * this.paddingPixels) / this.viewportWidth);
    const effectiveVerticalHalfFov = Math.atan(Math.tan(verticalHalfFov) * availableVertical);
    const effectiveHorizontalHalfFov = Math.atan(Math.tan(horizontalHalfFov) * availableHorizontal);

    // distance at which a sphere of this radius exactly touches the edges of a given half-FOV — the
    // larger of the two axes' requirement wins, so BOTH stay within their padding, not just one
    const distanceForVertical = radius / Math.sin(effectiveVerticalHalfFov);
    const distanceForHorizontal = radius / Math.sin(effectiveHorizontalHalfFov);
    const distance = Math.max(distanceForVertical, distanceForHorizontal);

    // exact, instant snap for damping <= 0 — the raw Damper has no such shortcut (unlike
    // Vector3Damper/QuaternionDamper elsewhere in klipp), it would only converge almost-instantly
    // through a tiny clamped smoothTime instead
    const instant = typeof this.damping === 'number' && this.damping <= 0;

    // re-arms each damper's own first-call snap — on reactivation, out was frozen at wherever an
    // earlier, unrelated activation left it, so easing from there would fly in from a stale distance
    if (justActivated) {
      this.distanceDamper.reset();
      this.centerOffsetXDamper.reset();
      this.centerOffsetYDamper.reset();
    }

    this.currentDistance = instant
      ? distance
      : this.distanceDamper.update(this.currentDistance, distance, this.damping, dt);

    // always exactly on the CURRENT rotation's sightline — see the field doc comment above for why this
    // has to stay undamped (only currentDistance itself eases)
    scratchBackward.set(0, 0, 1).applyQuaternion(out.quaternion);
    out.position.copy(scratchGroupPosition).addScaledVector(scratchBackward, this.currentDistance);

    this.currentCenterOffsetX = instant
      ? this.centerOffsetX
      : this.centerOffsetXDamper.update(this.currentCenterOffsetX, this.centerOffsetX, this.damping, dt);
    this.currentCenterOffsetY = instant
      ? this.centerOffsetY
      : this.centerOffsetYDamper.update(this.currentCenterOffsetY, this.centerOffsetY, this.damping, dt);
    out.viewOffsetX = this.currentCenterOffsetX;
    out.viewOffsetY = this.currentCenterOffsetY;

    return (
      this.currentDistance !== distance ||
      this.currentCenterOffsetX !== this.centerOffsetX ||
      this.currentCenterOffsetY !== this.centerOffsetY
    );
  };
}
