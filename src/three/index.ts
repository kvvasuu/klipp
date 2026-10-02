export { KlippThree, type KlippMode, type KlippThreeOptions, type FrameUpdate } from './KlippThree.js';
export {
  VirtualCameraThree,
  type VirtualCameraThreeOptions,
  type InitialCameraState,
  type CameraPiece,
} from './VirtualCameraThree.js';
export { copyCameraStateFromCamera, applyCameraState, writeCameraTransform, writeCameraLens } from './camera.js';
export { CameraFrustumHelperThree } from './CameraFrustumHelperThree.js';
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

export { HardLockToTargetBodyThree, type HardLockToTargetOptions } from './body/HardLockToTargetBodyThree.js';
export { FollowBodyThree, type FollowThreeOptions } from './body/FollowBodyThree.js';
export { PositionComposerBodyThree, type PositionComposerThreeOptions } from './body/PositionComposerBodyThree.js';

export { HardLookAtAimThree } from './aim/HardLookAtAimThree.js';
export {
  RotateWithFollowTargetAimThree,
  type RotateWithFollowTargetOptions,
} from './aim/RotateWithFollowTargetAimThree.js';
export { RotationComposerAimThree, type RotationComposerThreeOptions } from './aim/RotationComposerAimThree.js';
export { PanTiltAimThree } from './aim/PanTiltAimThree.js';

export { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './extension/TargetGroup.js';
export {
  GroupFramingExtensionThree,
  type GroupFramingOptions,
  type GroupFramingFitMode,
  type GroupFramingMode,
} from './extension/GroupFramingExtensionThree.js';

export {
  BasicMultiChannelPerlinNoiseThree,
  type PerlinNoiseThreeOptions,
} from './noise/BasicMultiChannelPerlinNoiseThree.js';
