import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { categories } from '../registry';

const readyCategories = categories
  .map((category) => ({ ...category, examples: category.examples.filter((example) => example.ready) }))
  .filter((category) => category.examples.length > 0);

export function Sidebar() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return readyCategories;
    return readyCategories
      .map((category) => ({
        ...category,
        examples: category.examples.filter(
          (example) => example.title.toLowerCase().includes(needle) || category.title.toLowerCase().includes(needle),
        ),
      }))
      .filter((category) => category.examples.length > 0);
  }, [query]);

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <a href="#/" className="sidebar-logo">
          Klipp - examples
        </a>
        <a href="https://kvvasuu.github.io/klipp/docs/" target="_blank" rel="noreferrer" className="sidebar-docs-link">
          Documentation ↗
        </a>
        <input
          type="search"
          className="sidebar-search"
          placeholder="Filter examples..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="sidebar-list">
        {filtered.map((category) => (
          <section key={category.slug} className="sidebar-category">
            <h2>{category.title}</h2>
            <ul>
              {category.examples.map((example) => (
                <li key={example.slug}>
                  <NavLink
                    to={`/${category.slug}/${example.slug}`}
                    className={({ isActive }) => (isActive ? 'active' : undefined)}>
                    {example.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {filtered.length === 0 && readyCategories.length > 0 && (
          <p className="sidebar-empty">No examples match "{query}".</p>
        )}
      </div>
    </nav>
  );
}
