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

function appendLine(root: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  const line = document.createElement('div');
  line.className = 'klipp-debug-crosshair';
  line.style.position = 'absolute';
  Object.assign(line.style, styles);
  root.appendChild(line);
}

/** Draws framing zones and a crosshair as DOM elements over a canvas container. */
export class DebugOverlay {
  private root: HTMLDivElement | null = null;

  /** Attaches the overlay to `container`, usually the canvas's parent. Disconnects the old one first. */
  connect = (container: HTMLElement): void => {
    this.disconnect();
    ensureStylesInjected();
    const root = document.createElement('div');
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.overflow = 'hidden';
    container.appendChild(root);
    this.root = root;
  };

  disconnect = (): void => {
    this.root?.remove();
    this.root = null;
  };

  /** Replaces what is drawn. Pass no zones and no crosshair to clear it. */
  render = (zones: readonly DebugZone[], crosshair?: [number, number]): void => {
    const root = this.root;
    if (!root) return;
    root.replaceChildren();
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
      appendLine(root, { left: `${ndcToPercent(crosshair[0], false)}%`, top: '0', bottom: '0', width: '1px' });
      appendLine(root, { top: `${ndcToPercent(crosshair[1], true)}%`, left: '0', right: '0', height: '1px' });
    }
  };
}
