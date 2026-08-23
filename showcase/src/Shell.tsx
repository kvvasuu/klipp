import { NavLink, Outlet } from 'react-router';
import { examples } from './examples/registry';

export function Shell() {
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="sidebar-title">klipp showcase</div>
        <ul>
          {examples.map(({ slug, title }) => (
            <li key={slug}>
              <NavLink to={`/${slug}`} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                {title}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
