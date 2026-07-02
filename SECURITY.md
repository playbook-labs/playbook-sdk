# Security Policy

## Reporting a vulnerability

Please report security issues privately to **security@playbook.com** rather than
opening a public issue. We aim to acknowledge reports within 3 business days.

## Scope notes for integrators

- The SDK authenticates using an API token sent as `Authorization: Bearer
  <token>`. Treat this token as a secret. Because the SDK runs in the browser,
  any token you pass to it is visible to end users — scope tokens to the
  narrowest workspace/board and permissions required, and prefer read-only
  tokens for public galleries.
- All asset- and board-provided strings are HTML-escaped before rendering.
