import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useIsActiveVirtualCamera } from './VirtualCamera';

export type DebugZone = {
  /** Same convention as `PositionComposer`/`RotationComposer`'s `screenPosition` - `0` = center, `±1` =
   *  frame edge. */
  screenPosition: [number, number];
  /** Box width/height, same units as `deadZone`/`hardLimit`. */
  size: [number, number];
  /** `klipp-debug-deadzone`, `klipp-debug-hardlimit`, or `klipp-debug-groupframing` - styled by
   *  `ensureStylesInjected`'s defaults, freely overridable from a consumer's own CSS targeting the same
   *  class. */
  className: string;
};

const STYLESHEET_ID = 'klipp-debug-zone-overlay-styles';

/** Sensible defaults for `klipp-debug-deadzone`/`klipp-debug-hardlimit`/`klipp-debug-groupframing`/
 *  `klipp-debug-crosshair` - ordinary CSS classes a consumer can override with their own stylesheet, no
 *  props needed. Geometry (position/size) is computed per frame and stays inline; nothing else here needs
 *  to be, so it lives in an actual stylesheet instead. Crosshair thickness stays inline too, even though
 *  it never changes - the perpendicular line needs the opposite axis (`width` vs `height`), and a shared
 *  class setting both would break the other axis's edge-to-edge stretch. */
function ensureStylesInjected(): void {
  if (document.getElementById(STYLESHEET_ID)) return;
  const style = document.createElement('style');
  style.id = STYLESHEET_ID;
  style.textContent = `
    .klipp-debug-deadzone {
      box-sizing: border-box;
      border: 2px solid #33cc33;
      box-shadow: 0 0 0 100vmax color-mix(in srgb, #33cc33 5%, transparent);
    }
    .klipp-debug-hardlimit {
      box-sizing: border-box;
      border: 2px solid #cc3333;
      box-shadow: 0 0 0 100vmax color-mix(in srgb, #cc3333 5%, transparent);
    }
    .klipp-debug-groupframing {
      box-sizing: border-box;
      border: 2px solid #3399cc;
      box-shadow: 0 0 0 100vmax color-mix(in srgb, #3399cc 5%, transparent);
    }
    .klipp-debug-crosshair { background: #ffcc00; }
  `;
  document.head.appendChild(style);
}

/** NDC (`-1` = one edge, `+1` = the other) to a CSS percentage - `invertY` flips the Y axis, since CSS
 *  `top` grows downward while `screenPosition`'s `+1` means up. */
function ndcToPercent(ndc: number, invertY: boolean): number {
  return ((invertY ? -ndc : ndc) + 1) * 50;
}

/**
 * Debug gizmo: a bordered box per zone (dimming everything outside it), plus an optional full-viewport
 * crosshair at `crosshair`'s screenPosition - a fixed reference line makes it much easier to see a target
 * drift off `screenPosition` than eyeballing it against the raw scene alone. Plain DOM manipulation,
 * always returning `null` to react-three-fiber - its reconciler can't render raw DOM nodes, and a
 * `react-dom` portal from within its own tree needs a bridging layer (like drei's `<Html>`) this avoids
 * depending on. Follows arbitration, not the blend - shown from the instant this `<VirtualCamera>` wins
 * (blend-in still in progress) until it loses (blend-out just starting), since `screenPosition`/`deadZone`
 * are flat overlay constants with nothing to actually wait on a blend for.
 */
export function DebugZoneOverlay({ zones, crosshair }: { zones: DebugZone[]; crosshair?: [number, number] }): null {
  const isActive = useIsActiveVirtualCamera();
  const container = useThree((state) => state.gl.domElement.parentElement);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!container) return;
    ensureStylesInjected();
    const root = document.createElement('div');
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.overflow = 'hidden';
    container.appendChild(root);
    rootRef.current = root;
    return () => {
      container.removeChild(root);
      rootRef.current = null;
    };
  }, [container]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.replaceChildren();
    if (!isActive) return;
    for (const zone of zones) {
      const halfWidth = zone.size[0] / 2;
      const halfHeight = zone.size[1] / 2;
      const left = ndcToPercent(zone.screenPosition[0] - halfWidth, false);
      const right = ndcToPercent(zone.screenPosition[0] + halfWidth, false);
      const top = ndcToPercent(zone.screenPosition[1] + halfHeight, true);
      const bottom = ndcToPercent(zone.screenPosition[1] - halfHeight, true);
      const box = document.createElement('div');
      box.className = zone.className;
      box.style.position = 'absolute';
      box.style.left = `${left}%`;
      box.style.top = `${top}%`;
      box.style.width = `${right - left}%`;
      box.style.height = `${bottom - top}%`;
      root.appendChild(box);
    }

    if (crosshair) {
      const vertical = document.createElement('div');
      vertical.className = 'klipp-debug-crosshair';
      vertical.style.position = 'absolute';
      vertical.style.left = `${ndcToPercent(crosshair[0], false)}%`;
      vertical.style.top = '0';
      vertical.style.bottom = '0';
      vertical.style.width = '1px';
      root.appendChild(vertical);

      const horizontal = document.createElement('div');
      horizontal.className = 'klipp-debug-crosshair';
      horizontal.style.position = 'absolute';
      horizontal.style.top = `${ndcToPercent(crosshair[1], true)}%`;
      horizontal.style.left = '0';
      horizontal.style.right = '0';
      horizontal.style.height = '1px';
      root.appendChild(horizontal);
    }
  });

  return null;
}
