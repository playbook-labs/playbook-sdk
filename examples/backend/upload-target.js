/**
 * Reference token-exchange backend for the Playbook Uploader.
 *
 * The browser never holds a write token. It asks THIS server for a one-time
 * upload target; this server holds the secret write token and talks to
 * Playbook. Two endpoints mirror Playbook's two-step signed upload:
 *
 *   POST /playbook/upload-target   -> create_upload_url  (mint signed target)
 *   POST /playbook/finish-upload   -> finish_upload       (register the asset)
 *
 *   browser                     this server                  Playbook
 *   ───────                     ───────────                  ────────
 *   getUploadTarget(file)  ──►  create_upload_url      ──►   signed target
 *        PUT bytes  ───────────────────────────────────►    (direct to storage)
 *   finishUpload(finalize) ──►  finish_upload          ──►   asset
 *
 * SECURITY — this file is the gate. The whole model assumes the backend, not
 * the browser, decides who may write. So it MUST, before going near production:
 *   1. Authenticate the caller (requireAuth below is a STUB — implement it).
 *   2. Lock CORS to your own origin(s).
 *   3. Rate-limit (an authed user can still spend your API quota / storage).
 *   4. Bind every value that was signed at step 1 server-side, and look them
 *      up again at step 2 — never trust the browser's echo. See `pending`.
 *
 * Node 18+ (global fetch). Run: PLAYBOOK_TOKEN=... PLAYBOOK_ORG=... node examples/backend/upload-target.js
 */
const express = require("express");

const PLAYBOOK_TOKEN = process.env.PLAYBOOK_TOKEN; // write scope — server-side only
const ORG = process.env.PLAYBOOK_ORG; // workspace slug
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ""; // e.g. https://app.example.com
const API = `https://api.playbook.com/v1/${ORG}`;

// NOTE: the two upstream paths below (`/uploads` and `/uploads/finish`) are
// illustrative — they model Playbook's two-step signed upload (create_upload_url
// then finish_upload). Confirm the exact REST routes and field names against the
// Playbook API docs (dev.playbook.com) before relying on this in production.

// Cap what the browser can request before spending a Playbook API call on it.
const MAX_BYTES = 104857600; // 100 MB — create_upload_url's ceiling
const ALLOWED_TYPES = [/^image\//, /^video\//];

// Server-side record of what was validated and signed at step 1, keyed by the
// signed id. finish looks these up instead of trusting the client — so the
// browser cannot change media_type/size/title or smuggle a collection_token.
// Use a TTL store (Redis) in production; an in-memory Map is fine for a demo.
const pending = new Map();

const app = express();
app.use(express.json({ limit: "16kb" }));

// Lock cross-origin access to your app. A wildcard here re-opens the door.
app.use((req, res, next) => {
  if (ALLOWED_ORIGIN) {
    res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// STUB — replace with a real check (session cookie, bearer, etc.). Shipped as a
// hard 501 so a copy-paste integrator cannot accidentally run an open endpoint.
function requireAuth(req, res, next) {
  // Example: const user = verifySession(req); if (!user) return res.sendStatus(401);
  return res
    .status(501)
    .json({ error: "implement requireAuth before using this backend" });
  // next();
}

function pbHeaders() {
  return {
    Authorization: `Bearer ${PLAYBOOK_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// Step 1 — mint a one-time signed target. Validate hard: this is the only gate
// between a caller and your workspace storage.
app.post("/playbook/upload-target", requireAuth, async (req, res) => {
  try {
    const { filename, mediaType } = req.body || {};
    const size = Number(req.body && req.body.size);

    if (typeof filename !== "string" || !filename) {
      return res.status(400).json({ error: "filename required" });
    }
    if (typeof mediaType !== "string" || !mediaType) {
      return res.status(400).json({ error: "mediaType required" });
    }
    if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
      return res.status(413).json({ error: "invalid or too-large size" });
    }
    if (!ALLOWED_TYPES.some((re) => re.test(mediaType))) {
      return res.status(415).json({ error: "unsupported media type" });
    }

    // Playbook's create_upload_url: returns the storage address + the exact
    // PUT to make, plus a signed_gcs_id you pass back to finish_upload.
    const r = await fetch(`${API}/uploads`, {
      method: "POST",
      headers: pbHeaders(),
      body: JSON.stringify({ filename, size, media_type: mediaType }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream failed" });
    const target = await r.json();

    // Remember what we signed. The browser only gets back an opaque id — the
    // board, type, size and title are decided HERE, not by the client.
    pending.set(target.signed_gcs_id, {
      mediaType,
      size,
      title: filename,
      // collectionToken: boardForThisUser(req), // route server-side if desired
    });

    res.json({
      uploadUrl: target.upload_url,
      method: target.method || "PUT",
      headers: target.headers || { "Content-Type": mediaType },
      finalize: { signedGcsId: target.signed_gcs_id }, // opaque; no secrets, no values
    });
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
});

// Step 2 — the bytes have landed; register them. Values come from our own
// record, never from the request body.
app.post("/playbook/finish-upload", requireAuth, async (req, res) => {
  try {
    const finalize = (req.body && req.body.finalize) || {};
    const record = pending.get(finalize.signedGcsId);
    if (!record) {
      return res.status(409).json({ error: "unknown or already-used upload" });
    }
    pending.delete(finalize.signedGcsId); // single use

    const r = await fetch(`${API}/uploads/finish`, {
      method: "POST",
      headers: pbHeaders(),
      body: JSON.stringify({
        signed_gcs_id: finalize.signedGcsId,
        media_type: record.mediaType,
        size: record.size,
        title: record.title,
        collection_token: record.collectionToken, // undefined -> workspace default
      }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream failed" });
    res.json(await r.json()); // the created asset
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
});

app.listen(3000, () => console.log("upload-target backend on :3000"));
