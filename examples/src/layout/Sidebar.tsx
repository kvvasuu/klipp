import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { categories } from '../registry';
import type { ExampleEntry } from '../registry/types';

const readyCategories = categories
  .map((category) => ({ ...category, examples: category.examples.filter((example) => example.ready) }))
  .filter((category) => category.examples.length > 0);

/** Collapses consecutive same-`group` entries into one block, so the sidebar can render them as a
 *  visually connected sub-list instead of separate top-level items. */
function groupExamples(examples: ExampleEntry[]): ExampleEntry[][] {
  const blocks: ExampleEntry[][] = [];
  for (const example of examples) {
    const last = blocks[blocks.length - 1];
    if (example.group && last?.[0].group === example.group) last.push(example);
    else blocks.push([example]);
  }
  return blocks;
}

export function Sidebar() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

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
    <nav className={`sidebar${isOpen ? ' menu-open' : ''}`}>
      <div className="sidebar-header">
        <a href="#/" className="sidebar-logo">
          Klipp - examples
        </a>
        <button
          type="button"
          className="sidebar-menu-toggle"
          aria-label="Toggle examples menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}>
          <span />
          <span />
          <span />
        </button>
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
              {groupExamples(category.examples).map((block) =>
                block.length > 1 ? (
                  <li key={block[0].group} className="example-group">
                    <NavLink
                      to={`/${category.slug}/${block[0].slug}`}
                      className={({ isActive }) => (isActive ? 'active' : undefined)}
                      onClick={() => setIsOpen(false)}>
                      {block[0].title}
                    </NavLink>
                    <ul className="example-subgroup">
                      {block.slice(1).map((example) => (
                        <li key={example.slug}>
                          <NavLink
                            to={`/${category.slug}/${example.slug}`}
                            className={({ isActive }) => (isActive ? 'active' : undefined)}
                            onClick={() => setIsOpen(false)}>
                            {example.title}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={block[0].slug}>
                    <NavLink
                      to={`/${category.slug}/${block[0].slug}`}
                      className={({ isActive }) => (isActive ? 'active' : undefined)}
                      onClick={() => setIsOpen(false)}>
                      {block[0].title}
                    </NavLink>
                  </li>
                ),
              )}
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
