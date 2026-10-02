# Security Policy

## Reporting a vulnerability

Please report security issues privately to **security@playbook.com** rather than
opening a public issue. We aim to acknowledge reports within 3 business days.

## Scope notes for integrators

- The SDK runs in the browser, so any token it holds is visible to end users.
  Never give it your API token. Keep that token on your server and have
  `getAccessToken` return a short-lived, read-only token limited to one board,
  created with `POST /v1/{organizationSlug}/access_tokens` (see "Set Up
  Authentication" in the README).
- Such a token can read its board and that board's sub-boards for at most an
  hour, and nothing else. Within the board it shows what the API token's owner
  can see, unapproved assets included, so point it at a board whose whole
  contents may be shown.
- If the gallery is not public, your token endpoint is the gate: check the
  visitor's session there before returning a token.
- The static `authToken` option is deprecated because it puts a long-lived
  token in the page.
- All asset- and board-provided strings are HTML-escaped before rendering.
