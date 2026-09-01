export { VirtualCameraController, type VirtualCameraSlots, type CameraStateWriter } from './VirtualCameraController';
export { KlippCore, type VirtualCameraConfig, type KlippCoreOptions } from './KlippCore';
export {
  createCameraState,
  copyCameraState,
  copyCameraStateFromCamera,
  applyCameraState,
  type CameraState,
} from './CameraState';
export { resolveTargetPosition, resolveTargetRotation, type Target } from './resolve/Target';
export { resolveVector3, isVector3Like } from './resolve/resolveVector3';
export { Damper, type DampingConstant } from './damping/Damper';
export { Vector3Damper } from './damping/Vector3Damper';
export { QuaternionDamper } from './damping/QuaternionDamper';

export { lerpCameraState } from './blend/lerpCameraState';
export { resolveBlendDefinition, type BlendDefinition, type CustomBlend } from './blend/BlendDefinition';
export { BlendHints, hasBlendHint } from './blend/BlendHints';
export { BlendCurves, type Ease } from './blend/BlendCurves';

export { Sequencer, type SequencerInstruction, type SequencerOptions } from './groups/Sequencer';
export { MixingCamera, type MixingCameraSlot } from './groups/MixingCamera';
export {
  StateDrivenCamera,
  type StateDrivenCandidate,
  type StateDrivenCameraOptions,
} from './groups/StateDrivenCamera';
export {
  ClearShot,
  type ClearShotCandidate,
  type ShotQualityEvaluator,
  type ClearShotOptions,
} from './groups/ClearShot';

export { HardLockToTargetBody } from './body/HardLockToTargetBody';
export { FollowBody } from './body/FollowBody';
export { BindingModes, type BindingMode } from './body/BindingModes';
export { PositionComposerBody } from './body/PositionComposerBody';

export { HardLookAtAim } from './aim/HardLookAtAim';
export { RotateWithFollowTargetAim } from './aim/RotateWithFollowTargetAim';
export { RotationComposerAim } from './aim/RotationComposerAim';

export { BasicMultiChannelPerlinNoise } from './noise/BasicMultiChannelPerlinNoise';

export { ImpulseManager, impulseManager, type GenerateImpulseOptions } from './impulse/ImpulseManager';
export { ImpulseListenerNoise } from './impulse/ImpulseListenerNoise';

export { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './framing/TargetGroup';
export { GroupFramingExtension } from './framing/GroupFramingExtension';
