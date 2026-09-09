import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useIsLiveVirtualCamera } from './VirtualCamera';

export type DebugZone = {
  /** Same convention as `PositionComposer`/`RotationComposer`'s `screenPosition` - `0` = center, `±1` =
   *  frame edge. */
  screenPosition: [number, number];
  /** Box width/height, same units as `deadZone`/`hardLimit`. */
  size: [number, number];
  color: string;
};

const CROSSHAIR_COLOR = '#ffcc00';

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
 * depending on. Shown only while this `<VirtualCamera>` is the one actually on screen.
 */
export function DebugZoneOverlay({ zones, crosshair }: { zones: DebugZone[]; crosshair?: [number, number] }): null {
  const isLive = useIsLiveVirtualCamera();
  const container = useThree((state) => state.gl.domElement.parentElement);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!container) return;
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
    if (!isLive) return;
    for (const zone of zones) {
      const halfWidth = zone.size[0] / 2;
      const halfHeight = zone.size[1] / 2;
      const left = ndcToPercent(zone.screenPosition[0] - halfWidth, false);
      const right = ndcToPercent(zone.screenPosition[0] + halfWidth, false);
      const top = ndcToPercent(zone.screenPosition[1] + halfHeight, true);
      const bottom = ndcToPercent(zone.screenPosition[1] - halfHeight, true);
      const box = document.createElement('div');
      box.style.position = 'absolute';
      box.style.left = `${left}%`;
      box.style.top = `${top}%`;
      box.style.width = `${right - left}%`;
      box.style.height = `${bottom - top}%`;
      box.style.border = `2px solid ${zone.color}`;
      box.style.boxSizing = 'border-box';
      box.style.boxShadow = `0 0 0 100vmax color-mix(in srgb, ${zone.color} 5%, transparent)`;
      root.appendChild(box);
    }

    if (crosshair) {
      const vertical = document.createElement('div');
      vertical.style.position = 'absolute';
      vertical.style.left = `${ndcToPercent(crosshair[0], false)}%`;
      vertical.style.top = '0';
      vertical.style.bottom = '0';
      vertical.style.width = '1px';
      vertical.style.background = CROSSHAIR_COLOR;
      root.appendChild(vertical);

      const horizontal = document.createElement('div');
      horizontal.style.position = 'absolute';
      horizontal.style.top = `${ndcToPercent(crosshair[1], true)}%`;
      horizontal.style.left = '0';
      horizontal.style.right = '0';
      horizontal.style.height = '1px';
      horizontal.style.background = CROSSHAIR_COLOR;
      root.appendChild(horizontal);
    }
  });

  return null;
}
