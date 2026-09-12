import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { SourceLink } from './SourceLink';

export function Layout() {
  return (
    <div className="app">
      <Sidebar />
      <main className="viewer">
        <Outlet />
        <SourceLink />
      </main>
    </div>
  );
}
