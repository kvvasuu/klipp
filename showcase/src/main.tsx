import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import './index.css';
import { Shell } from './Shell';
import { examples } from './examples/registry';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to={`/${examples[0].slug}`} replace />} />
          {examples.map(({ slug, Component }) => (
            <Route key={slug} path={slug} element={<Component />} />
          ))}
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);
