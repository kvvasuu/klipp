/** The part of Vite's `import.meta.env` the tests read. */
interface ImportMeta {
  readonly env: { readonly MODE: string };
}
