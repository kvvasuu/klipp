import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useIsActiveVirtualCamera } from './VirtualCameraContext';

export type DebugZone = {
  /** Zone center in normalized screen coordinates. */
  screenPosition: [number, number];
  /** Zone width and height. */
  size: [number, number];
  /** CSS class applied to the zone. */
  className: string;
};

const STYLESHEET_ID = 'klipp-debug-zone-overlay-styles';

/** Inject default overlay styles once. */
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

/** Convert normalized screen coordinates to CSS percentages. */
function ndcToPercent(ndc: number, invertY: boolean): number {
  return ((invertY ? -ndc : ndc) + 1) * 50;
}

/** Renders debug zones and an optional crosshair as DOM overlays. */
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
