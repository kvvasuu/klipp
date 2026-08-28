import { degreesToRadians } from 'maath';
import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Vector3Damper } from '../damping/Vector3Damper';
import type { DampingConstant } from '../damping/Damper';
import type { TargetGroup } from './TargetGroup';

const scratchGroupPosition = new Vector3();
/** THREE cameras look down their own local -Z — this rotated into world space is "away from what
 *  the camera is looking at", i.e. the direction to dolly back along. */
const scratchBackward = new Vector3();
const scratchDesiredPosition = new Vector3();

/**
 * Position-only camera extension: dollies `out.position` straight back along the camera's OWN current
 * view axis so `group`'s bounding sphere stays fully framed with `paddingPixels` of margin on every
 * side, at the current `viewportWidth`/`viewportHeight`. Doesn't touch `out.quaternion`/`out.fov` — this
 * is "Dolly Only" framing, so it only works correctly when Aim already looks straight at `group`'s own
 * position (its sightline is the axis this dollies along); it does nothing on its own to keep the group
 * centered if Aim looks elsewhere.
 *
 * A `group` that currently resolves to a dimensionless point (bounding radius `0`, including "nothing
 * resolves at all") is a no-op — there's no meaningful distance that "frames" a single point.
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
   *  asymmetric damping — see `DampingConstant`). `0` (default) = hard, instant fit. */
  damping: DampingConstant;

  private readonly damper = new Vector3Damper();
  // damping's OWN persistent memory of "where the camera currently is", independent of out.position —
  // Body/Aim run before this extension and may overwrite out.position every frame regardless of history
  // (e.g. an undamped Body resets it to a fixed spot), so damping needs a value nothing else touches
  private readonly currentPosition = new Vector3();

  constructor(
    group: TargetGroup,
    paddingPixels = 0,
    viewportWidth = 1,
    viewportHeight = 1,
    damping: DampingConstant = 0,
  ) {
    this.group = group;
    this.paddingPixels = paddingPixels;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.damping = damping;
  }

  update = (out: CameraState, dt: number): void => {
    const radius = this.group.computeBounds(scratchGroupPosition);
    if (radius <= 0) return;

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

    scratchBackward.set(0, 0, 1).applyQuaternion(out.quaternion);
    scratchDesiredPosition.copy(scratchGroupPosition).addScaledVector(scratchBackward, distance);
    this.damper.update(this.currentPosition, scratchDesiredPosition, this.damping, dt);
    out.position.copy(this.currentPosition);
  };
}
