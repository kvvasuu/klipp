import { useState } from 'react';

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
