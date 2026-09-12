import { Leva } from 'leva';
import { HashRouter, Route, Routes } from 'react-router';
import { Layout } from './layout/Layout';
import { SceneRoute } from './layout/SceneRoute';
import { Welcome } from './layout/Welcome';

export function App() {
  return (
    <HashRouter>
      <Leva collapsed />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Welcome />} />
          <Route path=":category/:slug" element={<SceneRoute />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
