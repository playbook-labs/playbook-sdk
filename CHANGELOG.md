# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0]

### Added

- `getAccessToken`: an async function the SDK calls for a short-lived access
  token before its first request and again when the token expires (on a 401).
  The token is kept in memory only. Requests that start or fail together share
  one call to it.
- `examples/backend/token-server.mjs`, a dependency-free server that exchanges
  an API token for a short-lived, read-only, single-board token.
- Four components, each its own bundle: a media picker (`PlaybookPicker`), an
  inline video player (`PlaybookPlayer`), a single asset embed
  (`PlaybookEmbed`) and a headless search box (`PlaybookSearch`). See
  [docs/components.md](docs/components.md).
- `package.json` exports for every bundle: `playbook-sdk/uploader`, `/viewer`,
  `/picker`, `/player`, `/embed` and `/search`.

### Deprecated

- `authToken`. It still works and logs a warning; a long-lived token in the
  page can be read by anyone. Use `getAccessToken`.

### Fixed

- Search and AI search now stay inside `boardId` and its sub-boards. They
  used to search everything the token could read, even in a gallery limited
  to one board.

## [1.0.4]

### Changed

- Moved the SDK source to `src/playbook-sdk.js` and added a real build step
  (`npm run build`, powered by esbuild) that emits both a readable
  `dist/playbook-sdk.js` and a genuinely minified `dist/playbook-sdk.min.js`
  (~31KB → ~7KB gzipped). Previously the shipped `.min.js` was unminified.
- `PlaybookSDK.version` is now single-sourced from `package.json` at build time.

### Added

- MIT `LICENSE` file (the package already declared MIT).
- Dependency-free smoke tests (`npm test`) and a CI workflow.
- `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.

### Fixed

- Documentation corrected to reflect self-serve API tokens (Developer → SDK in
  the Playbook app) and accurate bundle sizes.

## [1.0.3]

- Bearer-token authentication via the `Authorization` header; API base URL
  derived from `organizationSlug`.

## [1.0.1] - [1.0.2]

- Iterative fixes to gallery rendering, board navigation, and pagination.

## [1.0.0]

- Initial release: responsive masonry gallery, search, board navigation,
  modal viewer, download support, and TypeScript definitions.

[1.1.0]: https://github.com/playbook-labs/playbook-sdk/releases/tag/v1.1.0
[1.0.4]: https://github.com/playbook-labs/playbook-sdk/releases/tag/v1.0.4
[1.0.3]: https://github.com/playbook-labs/playbook-sdk/releases/tag/v1.0.3
[1.0.0]: https://github.com/playbook-labs/playbook-sdk/releases/tag/v1.0.0
