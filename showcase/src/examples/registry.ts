import type { ComponentType } from 'react';
import { BodyAimDecoupling } from './BodyAimDecoupling';
import { MultiCameraBlending } from './MultiCameraBlending';

export type ExampleEntry = {
  slug: string;
  title: string;
  Component: ComponentType;
};

/** Single source of truth for both the sidebar links and the router's routes — adding an example is one
 *  entry here, nothing else to touch. */
export const examples: ExampleEntry[] = [
  { slug: 'multi-camera-blending', title: 'Multi-Camera Blending', Component: MultiCameraBlending },
  { slug: 'body-aim-decoupling', title: 'Body & Aim Decoupling', Component: BodyAimDecoupling },
];
