// Example backend for the gallery's `getAccessToken`: exchanges your API token
// for a short-lived, read-only token limited to one board, so the API token
// never reaches the browser.
//
// Node 18+, no dependencies:
//   PLAYBOOK_TOKEN=... PLAYBOOK_ORG=... PLAYBOOK_BOARD=... node examples/backend/token-server.mjs
import { createServer } from "node:http";

const PLAYBOOK_TOKEN = process.env.PLAYBOOK_TOKEN; // API token from Developer → SDK
const ORG = process.env.PLAYBOOK_ORG; // workspace slug
const BOARD = process.env.PLAYBOOK_BOARD; // token of the board the gallery shows
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN; // the gallery's origin, if it is not this server
const PORT = process.env.PORT || 3001;
const EXPIRES_IN = 900; // seconds, 60 to 3600; the SDK asks again when the token expires

createServer(async (req, res) => {
  if (ALLOWED_ORIGIN) res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  if (req.method !== "GET" || req.url !== "/playbook/token") {
    res.writeHead(404).end();
    return;
  }

  // If the gallery is not public, check the visitor's session here first.

  try {
    const upstream = await fetch(`https://api.playbook.com/v1/${ORG}/access_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PLAYBOOK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ board_token: BOARD, expires_in: EXPIRES_IN }),
    });
    if (!upstream.ok) {
      res.writeHead(502).end();
      return;
    }

    const { data } = await upstream.json();
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ token: data.access_token }));
  } catch {
    res.writeHead(502).end();
  }
}).listen(PORT, () => console.log(`token server on :${PORT}`));
