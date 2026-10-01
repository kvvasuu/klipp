import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import {
  createGroupFramingParams,
  createGroupFramingState,
  updateGroupFraming,
  type GroupFramingFitMode,
  type GroupFramingMode,
  type GroupFramingParams,
  type GroupMember,
  type GroupPositionMode,
} from './groupFraming.js';

export type GroupFramingOptions = Partial<GroupFramingParams>;

/** Keeps a group of members in frame by adjusting distance and view offset. Layers override `readMembers`. */
export class GroupFramingExtensionCore implements GroupFramingParams {
  /** The members, updated by the caller every frame. */
  members: readonly GroupMember[];
  positionMode: GroupPositionMode;
  declare padding: number;
  declare viewportWidth: number;
  declare viewportHeight: number;
  declare damping: DampingConstant;
  declare maxSpeed: number;
  declare screenPosition: [number, number];
  declare fitMode: GroupFramingFitMode;
  declare minDistance: number;
  declare maxDistance: number;
  declare framingMode: GroupFramingMode;

  readonly state = createGroupFramingState();

  constructor(
    members: readonly GroupMember[] = [],
    positionMode: GroupPositionMode = 'groupCenter',
    options?: GroupFramingOptions,
  ) {
    this.members = members;
    this.positionMode = positionMode;
    Object.assign(this, createGroupFramingParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    const members = this.readMembers();
    return updateGroupFraming(out, this.state, this, members, this.positionMode, dt, justActivated);
  };

  /** This frame's members. */
  protected readMembers(): readonly GroupMember[] {
    return this.members;
  }
}
