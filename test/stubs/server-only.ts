// No-op stand-in for the real `server-only` package, which throws on import
// by design outside a bundler that special-cases it. Vitest aliases the
// package to this file (see vitest.config.ts) so tests can import modules
// that carry the server-only guard — the guard's job is to stop *client
// bundles* from pulling in server code, and a Node test process is not a
// client bundle.
export {};
