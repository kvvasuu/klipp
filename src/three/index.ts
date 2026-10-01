export { copyCameraStateFromCamera, applyCameraState, writeCameraTransform, writeCameraLens } from './camera.js';
export { readTargetPose, readTargetRotation } from './readTargetPose.js';
export { readTargetExtent } from './readTargetExtent.js';
export {
  resolveTargetPosition,
  resolveTargetRotation,
  resolveTargetSize,
  type Target,
  type RefLike,
} from './resolve/Target.js';
export { resolveVector3, resolveVec3, isVector3Like, type Vector3Like } from './resolve/resolveVector3.js';
export { TargetRegistry, type TargetSlot, type RegisteredTarget } from './resolve/TargetRegistry.js';

export { Vector3Damper } from './damping/Vector3Damper.js';
export { QuaternionDamper } from './damping/QuaternionDamper.js';
export { Predictor } from './damping/Predictor.js';

export { HardLockToTargetBody } from './body/HardLockToTargetBody.js';
export { FollowBody } from './body/FollowBody.js';
export { PositionComposerBody, type PositionComposerOptions } from './body/PositionComposerBody.js';

export { HardLookAtAim } from './aim/HardLookAtAim.js';
export { RotateWithFollowTargetAim } from './aim/RotateWithFollowTargetAim.js';
export { RotationComposerAim } from './aim/RotationComposerAim.js';
export { PanTiltAim } from './aim/PanTiltAim.js';

export { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './extension/TargetGroup.js';
export {
  GroupFramingExtension,
  type GroupFramingFitMode,
  type GroupFramingMode,
} from './extension/GroupFramingExtension.js';
