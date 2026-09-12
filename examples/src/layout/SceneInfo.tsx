import { useState } from 'react';

/** A small "?" button revealing a scene's description in a popover - closed by default so it never
 *  competes with the scene itself for attention. Rendered by `SceneRoute` as a plain DOM overlay
 *  alongside the Canvas, not from inside the scene/r3f tree. */
export function SceneInfo({ title, description }: { title: string; description: string }) {
  const [open, setOpen] = useState(!window.matchMedia('(max-width: 45rem)').matches);

  return (
    <div className="scene-info">
      <button
        type="button"
        className="scene-info-toggle"
        aria-label="About this scene"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}>
        ?
      </button>
      {open && (
        <div className="scene-info-popover">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      )}
    </div>
  );
}
