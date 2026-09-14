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
      <Leva
        collapsed={isMobile}
        titleBar={{ position: isMobile ? { x: 0, y: 60 } : undefined }}
        theme={{ sizes: { rootWidth: '20rem' } }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Welcome />} />
          <Route path=":category/:slug" element={<SceneRoute />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
