export { createCameraState, copyCameraState, mergeCameraState, type CameraState } from './CameraState';
export { createTargetPose, type TargetPose } from './TargetPose';
export { createTargetExtent, projectTargetExtent, type TargetExtent } from './TargetExtent';
export { EventDispatcher, type DispatchedEvent, type EventListener } from './EventDispatcher';
export { VirtualCameraController, type VirtualCameraSlots, type CameraStateWriter } from './VirtualCameraController';
export { KlippCore, type VirtualCameraConfig, type KlippCoreOptions, type CameraTransitionEventMap } from './KlippCore';
export {
  createKlippState,
  registerKlippCamera,
  unregisterKlippCamera,
  setKlippPriority,
  setKlippHints,
  tickKlipp,
  DEFAULT_BLEND,
  type KlippState,
  type KlippCamera,
  type KlippEvent,
  type KlippParams,
} from './klippState';

export { Damper, damp, createDamperState, resetDamper, type DamperState, type DampingConstant } from './damping/Damper';
export {
  dampVector3,
  createVector3DamperState,
  resetVector3Damper,
  type Vector3DamperState,
} from './damping/dampVector3';
export { dampQuaternion } from './damping/dampQuaternion';
export {
  addPredictorPosition,
  predictPositionDelta,
  createPredictorState,
  resetPredictor,
  type PredictorState,
} from './damping/predictor';

export { lerpCameraState } from './blend/lerpCameraState';
export {
  createBlendState,
  setBlendTarget,
  tickBlend,
  forgetBlendCandidate,
  blendTargetId,
  type BlendState,
  type BlendTransition,
} from './blend/blend';
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

export { BindingModes, type BindingMode } from './body/BindingModes';
export {
  updateFollow,
  primeFollow,
  createFollowState,
  followNeedsTargetRotation,
  type FollowParams,
  type FollowState,
} from './body/follow';
export {
  updateHardLockToTarget,
  createHardLockToTargetState,
  type HardLockToTargetParams,
  type HardLockToTargetState,
} from './body/hardLockToTarget';
export {
  updatePositionComposer,
  primePositionComposer,
  createPositionComposerState,
  type PositionComposerParams,
  type PositionComposerState,
} from './body/positionComposer';
export { updateHardLookAt } from './aim/hardLookAt';
export {
  updateRotateWithFollowTarget,
  primeRotateWithFollowTarget,
  createRotateWithFollowTargetState,
  type RotateWithFollowTargetParams,
  type RotateWithFollowTargetState,
} from './aim/rotateWithFollowTarget';
export { updatePanTilt, seedPanTilt, createPanTiltState, type PanTiltState } from './aim/panTilt';
export {
  updateRotationComposer,
  primeRotationComposer,
  createRotationComposerState,
  rotationComposerNeedsExtent,
  type RotationComposerParams,
  type RotationComposerState,
} from './aim/rotationComposer';

export { LensExtension } from './extension/LensExtension';
export { updateLens, createLensState, type LensParams, type LensState } from './extension/lens';
export {
  updateGroupFraming,
  computeGroupBounds,
  createGroupFramingState,
  createGroupMember,
  type GroupMember,
  type GroupPositionMode,
  type GroupFramingParams,
  type GroupFramingState,
  type GroupFramingFitMode,
  type GroupFramingMode,
} from './extension/groupFraming';
export { InputAxis, type InputAxisRecentering } from './input/InputAxis';

export { BasicMultiChannelPerlinNoise } from './noise/BasicMultiChannelPerlinNoise';
export {
  updatePerlinNoise,
  createPerlinNoiseState,
  type PerlinNoiseParams,
  type PerlinNoiseState,
} from './noise/perlinNoise';
export { ImpulseField, impulseField } from './impulse/ImpulseField';
export { ImpulseListenerNoise } from './impulse/ImpulseListenerNoise';
export {
  ImpulseShapes,
  generateImpulse,
  sampleImpulses,
  pruneImpulses,
  createImpulseFieldState,
  impulseNow,
  type GenerateImpulseOptions,
  type ImpulseShape,
  type ImpulseEvent,
  type ImpulseFieldState,
  type ImpulseClockSeconds,
} from './impulse/impulses';
