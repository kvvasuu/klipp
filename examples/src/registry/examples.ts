import { Placeholder } from '../scenes/Placeholder';
import { HardLookAt } from '../scenes/aim/HardLookAt';
import { Follow } from '../scenes/body/Follow';
import { HardLockToTarget } from '../scenes/body/HardLockToTarget';
import type { ExampleCategory } from './types';

/** Every scene not built yet points at `Placeholder` - see TODO-examples.md for the full plan this
 *  mirrors. Swap an entry's `Scene` in place as it gets built, nothing else needs to change. */
export const categories: ExampleCategory[] = [
  {
    slug: 'body',
    title: 'Body',
    examples: [
      {
        slug: 'hard-lock-to-target',
        title: 'HardLockToTarget',
        Scene: HardLockToTarget,
        description:
          "The simplest Body: the camera's position becomes exactly the target's position, no offset, no framing. Watch the spectator inset - the frustum trails behind the orbiting anchor by exactly `damping` seconds.",
        ready: true,
      },
      {
        slug: 'follow',
        title: 'Follow',
        Scene: Follow,
        description:
          'A plane flies a continuous figure-eight with a vertical bob, banking hard into every turn. The camera follows at a fixed offset controlled by `bindingMode`.',
        spectatorPosition: [0, 14, 18],
        spectatorTarget: [0, 3, 0],
        ready: true,
      },
      { slug: 'position-composer', title: 'PositionComposer', Scene: Placeholder, ready: false },
    ],
  },
  {
    slug: 'aim',
    title: 'Aim',
    examples: [
      {
        slug: 'hard-look-at',
        title: 'HardLookAt',
        Scene: HardLookAt,
        description:
          'The simplest Aim: the camera rotates so the target is dead-center, every frame, with zero damping. The camera never moves.\nSwitch "activeTarget" to see the re-aim snap instantly.',
        spectatorPosition: [0, 4, 15],
        spectatorTarget: [0, 2, 0],
        ready: true,
      },
      { slug: 'rotate-with-follow-target', title: 'RotateWithFollowTarget', Scene: Placeholder, ready: false },
      { slug: 'rotation-composer', title: 'RotationComposer', Scene: Placeholder, ready: false },
    ],
  },
  {
    slug: 'noise',
    title: 'Noise',
    examples: [
      { slug: 'basic-multi-channel-perlin', title: 'BasicMultiChannelPerlin', Scene: Placeholder, ready: false },
      { slug: 'impulse', title: 'Impulse', Scene: Placeholder, ready: false },
    ],
  },
  {
    slug: 'extension',
    title: 'Extension',
    examples: [
      { slug: 'group-framing', title: 'GroupFraming', Scene: Placeholder, ready: false },
      { slug: 'lens', title: 'Lens', Scene: Placeholder, ready: false },
    ],
  },
  {
    slug: 'camera-controls',
    title: 'Camera Controls',
    examples: [
      { slug: 'locked', title: 'Locked orbit', Scene: Placeholder, ready: false },
      { slug: 'free-vs-locked', title: 'Free vs. locked', Scene: Placeholder, ready: false },
    ],
  },
  {
    slug: 'debugging',
    title: 'Debugging',
    examples: [{ slug: 'camera-frustum-helper', title: 'CameraFrustumHelper', Scene: Placeholder, ready: false }],
  },
  {
    slug: 'blending',
    title: 'Blending',
    examples: [
      { slug: 'blend-curves', title: 'BlendCurves', Scene: Placeholder, ready: false },
      { slug: 'blend-hints', title: 'BlendHints', Scene: Placeholder, ready: false },
      { slug: 'custom-blends', title: 'CustomBlends', Scene: Placeholder, ready: false },
    ],
  },
  {
    slug: 'events',
    title: 'Camera Events',
    examples: [{ slug: 'camera-events', title: 'Camera Events', Scene: Placeholder, ready: false }],
  },
  {
    slug: 'combined',
    title: 'Combined rigs',
    examples: [
      { slug: 'third-person-chase-cam', title: 'Third-person chase cam', Scene: Placeholder, ready: false },
      { slug: 'top-down-strategy-camera', title: 'Top-down / strategy camera', Scene: Placeholder, ready: false },
      { slug: 'cutscene-system', title: 'Cutscene system', Scene: Placeholder, ready: false },
      { slug: 'impact-feedback', title: 'Impact feedback', Scene: Placeholder, ready: false },
      { slug: 'kitchen-sink', title: 'Kitchen sink', Scene: Placeholder, ready: false },
    ],
  },
  {
    slug: 'tutorials',
    title: 'Tutorials',
    examples: [
      {
        slug: 'third-person-from-scratch',
        title: 'Third-person camera from scratch',
        Scene: Placeholder,
        ready: false,
      },
      { slug: 'gameplay-cutscene-handoff', title: 'Gameplay <-> cutscene handoff', Scene: Placeholder, ready: false },
      { slug: 'camera-shake-on-hit', title: 'Camera shake on hit', Scene: Placeholder, ready: false },
      {
        slug: 'custom-extension-parallax',
        title: 'Custom Extension: pointer parallax',
        Scene: Placeholder,
        ready: false,
      },
      { slug: 'ui-reacting-to-events', title: 'UI reacting to camera events', Scene: Placeholder, ready: false },
      { slug: 'debugging-dead-zones', title: 'Debugging dead zones live', Scene: Placeholder, ready: false },
    ],
  },
];
