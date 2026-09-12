import { Leva } from 'leva';
import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { Layout } from './layout/Layout';
import { SceneRoute } from './layout/SceneRoute';
import { Welcome } from './layout/Welcome';

export function App() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 45rem)').matches);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 45rem)');
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <HashRouter>
      {/* nudged down on mobile via titleBar.position - Leva's own header bar would otherwise sit under it */}
      <Leva collapsed={isMobile} titleBar={{ position: isMobile ? { x: 0, y: 60 } : undefined }} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Welcome />} />
          <Route path=":category/:slug" element={<SceneRoute />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
