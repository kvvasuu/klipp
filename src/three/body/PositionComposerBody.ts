import type { Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import {
  createPositionComposerState,
  primePositionComposer,
  updatePositionComposer,
  type PositionComposerParams,
} from '../../core/body/positionComposer.js';
import { createTargetExtent } from '../../core/TargetExtent.js';
import { createTargetPose } from '../../core/TargetPose.js';
import { readTargetExtent } from '../readTargetExtent.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import type { Vector3Like } from '../resolve/resolveVector3.js';

/** Positions the camera using depth and screen-space composition. */
export class PositionComposerBody implements PositionComposerParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  cameraDistance: number;
  screenPosition: [number, number];
  aspect: number;
  deadZone: [number, number];
  damping: DampingConstant;
  hardLimit: [number, number];
  depthDeadZone: number;
  maxSpeed: number;
  radius?: number;
  size?: Vector3Like;
  lookaheadTime: number;
  lookaheadSmoothing: number;
  lookaheadIgnoreY: boolean;

  readonly state = createPositionComposerState();
  private readonly pose = createTargetPose();
  private readonly extent = createTargetExtent();
  private lastTarget: Target = undefined;
  private forceSizeRecalculation = false;

  constructor(
    target: Target,
    cameraDistance = 10,
    screenPosition: [number, number] = [0, 0],
    aspect = 1,
    deadZone: [number, number] = [0, 0],
    damping: DampingConstant = 0,
    hardLimit: [number, number] = [0, 0],
    radius?: number,
    size?: Vector3Like,
    depthDeadZone = 0,
    lookaheadTime = 0,
    lookaheadSmoothing = 1,
    lookaheadIgnoreY = false,
    maxSpeed = Infinity,
  ) {
    this.target = target;
    this.cameraDistance = cameraDistance;
    this.screenPosition = screenPosition;
    this.aspect = aspect;
    this.deadZone = deadZone;
    this.damping = damping;
    this.hardLimit = hardLimit;
    this.radius = radius;
    this.size = size;
    this.depthDeadZone = depthDeadZone;
    this.lookaheadTime = lookaheadTime;
    this.lookaheadSmoothing = lookaheadSmoothing;
    this.lookaheadIgnoreY = lookaheadIgnoreY;
    this.maxSpeed = maxSpeed;
  }

  /** Forces the auto-detected `size` to be re-measured on the next `update()`, then goes back to the cached value. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  primeFrom = (position: Vec3): void => primePositionComposer(this.state, this, position);

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const resolved = readTargetPose(this.pose, this.target, this.targetSlot, false);
    const retarget = resolved && this.target !== this.lastTarget;
    if (resolved) {
      this.lastTarget = this.target;
      readTargetExtent(this.extent, this.target, this.size, this.radius, this.forceSizeRecalculation, this.targetSlot);
      this.forceSizeRecalculation = false;
    }
    const targetPosition = resolved ? this.pose.position : null;
    updatePositionComposer(out, this.state, this, targetPosition, this.extent, dt, justActivated, retarget);
  };
}
