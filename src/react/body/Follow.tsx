import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createFollowParams } from '../../core/body/follow.js';
import { resolveVec3 } from '../../three/resolve/resolveVector3.js';
import type { Target } from '../../three/resolve/Target.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { FollowBody, type FollowOptions } from '../../three/body/FollowBody.js';

export type FollowProps = FollowOptions & {
  /** Target to follow. Unresolved targets are ignored. */
  target?: Target;
  ref?: Ref<FollowBody>;
};

/** Follows a target with a configurable offset and rotation frame. */
export function Follow({ target, offset, ref, ...settings }: FollowProps) {
  const camera = useVirtualCamera();
  const { offset: defaultOffset, ...params } = createFollowParams(settings);
  const [body] = useState(() => new FollowBody(target, params));
  body.target = target;
  Object.assign(body, params);
  resolveVec3(body.offset, offset ?? defaultOffset);

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => camera.setBody(body), [camera, body]);

  return null;
}
