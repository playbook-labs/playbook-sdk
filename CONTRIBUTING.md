# Contributing

Thanks for your interest in improving the Playbook Gallery SDK.

## Project layout

| Path                        | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `src/playbook-sdk.js`       | **Source of truth.** Edit here.                    |
| `dist/`                     | Build output. Never hand-edit — regenerated.       |
| `index.d.ts`                | TypeScript definitions (kept in sync manually).    |
| `test/`                     | `node --test` smoke tests.                         |
| `examples/`                 | Vanilla + React example apps.                      |
| `docs/`                     | Long-form guides.                                  |

## Development

```bash
npm install      # dev dependencies (esbuild only)
npm run build    # src/ -> dist/playbook-sdk.js + dist/playbook-sdk.min.js
npm test         # node --test
```

Try changes locally by opening `examples/complete-example.html` (uses a mock
API) or running the React demo in `examples/react`.

## Guidelines

- Keep the SDK **zero runtime dependencies**. esbuild is the only dev dependency.
- Preserve the UMD wrapper so the bundle works as an ESM/CJS import, an AMD
  module, and a browser global.
- Prefix all CSS classes with `pb-` to avoid collisions in host pages.
- Escape any user- or API-provided strings before inserting them into the DOM
  (`escapeHtml`). Never interpolate untrusted values into `innerHTML` raw.
- Update `index.d.ts` when you change the public config or instance API.
- Commit the regenerated `dist/` alongside source changes.

## Releasing

1. Bump `version` in `package.json` (semver).
2. `npm run build` — the version is injected into the bundles automatically.
3. Add a `CHANGELOG.md` entry.
4. `npm publish` (runs `build` + `test` via `prepublishOnly`).
5. Tag the release: `git tag v<version> && git push --tags`.
