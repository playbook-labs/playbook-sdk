/**
 * Reference token-exchange backend for the Playbook Uploader.
 *
 * The browser never holds a write token. It asks THIS server to prepare an
 * upload; this server holds the secret write token and calls Playbook's
 * two-step upload API. The browser performs the signed transfer itself and
 * then asks this server to complete it.
 *
 *   POST /playbook/upload-target   -> assets/upload_prepare   (prepare)
 *   POST /playbook/finish-upload   -> assets/upload_complete   (register)
 *
 *   browser                      this server                   Playbook
 *   ───────                      ───────────                   ────────
 *   getUploadTarget(file)   ──►  assets/upload_prepare    ──►  signed target
 *        transfer bytes  ────────────────────────────────►    (direct to storage,
 *                                                               GCS resumable or
 *                                                               Backblaze PUT/parts)
 *   finishUpload(target)    ──►  assets/upload_complete   ──►  asset
 *
 * SECURITY — this file is the gate. Before production it MUST:
 *   1. Authenticate the caller (requireAuth below is a 501 STUB — implement it).
 *   2. Lock CORS to your own origin(s).
 *   3. Rate-limit.
 *   4. Decide title/board HERE (bound at prepare, keyed by signed_gcs_id) and
 *      re-read them at complete — never trust the browser's echo for those.
 *      signed_gcs_id / multipart_upload_id are passed back by the browser but
 *      are verified by the Playbook API, so a forged one fails.
 *
 * Node 18+ (global fetch). Run: PLAYBOOK_TOKEN=... PLAYBOOK_ORG=... node examples/backend/upload-target.js
 */
const express = require("express");

const PLAYBOOK_TOKEN = process.env.PLAYBOOK_TOKEN; // write scope — server-side only
const ORG = process.env.PLAYBOOK_ORG; // workspace slug
const BOARD = process.env.PLAYBOOK_BOARD || ""; // optional: file uploads into this board
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ""; // e.g. https://app.example.com
const API = `https://api.playbook.com/v1/${ORG}`;

const ALLOWED_TYPES = [/^image\//, /^video\//];

// What we validated/decided at prepare, keyed by the signed id. Complete reads
// title/board from here, not from the browser. Use a TTL store in production.
const pending = new Map();

const app = express();
app.use(express.json({ limit: "16kb" }));

app.use((req, res, next) => {
  if (ALLOWED_ORIGIN) {
    res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// STUB — replace with a real check. Shipped as a hard 501 so a copy-paste
// integrator cannot accidentally run an open endpoint.
function requireAuth(req, res, next) {
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

// Step 1 — prepare. Validate hard, then ask Playbook for the signed target.
app.post("/playbook/upload-target", requireAuth, async (req, res) => {
  try {
    const { filename, mediaType } = req.body || {};
    const size = Number(req.body && req.body.size);
    if (typeof filename !== "string" || !filename) {
      return res.status(400).json({ error: "filename required" });
    }
    if (typeof mediaType !== "string" || !ALLOWED_TYPES.some((re) => re.test(mediaType))) {
      return res.status(415).json({ error: "unsupported media type" });
    }
    if (!Number.isInteger(size) || size <= 0) {
      return res.status(400).json({ error: "invalid size" });
    }

    const r = await fetch(`${API}/assets/upload_prepare`, {
      method: "POST",
      headers: pbHeaders(),
      body: JSON.stringify({
        asset: {
          title: filename,
          media_type: mediaType,
          size,
          collection_token: BOARD || undefined,
        },
      }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream failed" });
    const { data } = await r.json();

    // Bind title/board to this upload; complete looks them up by signed id.
    pending.set(data.signed_gcs_id, {
      title: filename,
      collection_token: data.collection_token || BOARD || undefined,
    });

    // The browser needs the whole prepare response to perform the transfer.
    // None of it is secret (signed URLs + opaque metadata).
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
});

// Step 2 — complete. The browser sends the target back; we use OUR stored
// title/board and the signed ids (which Playbook verifies).
app.post("/playbook/finish-upload", requireAuth, async (req, res) => {
  try {
    const target = (req.body && req.body.target) || {};
    const record = pending.get(target.signed_gcs_id);
    if (!record) {
      return res.status(409).json({ error: "unknown or already-used upload" });
    }
    pending.delete(target.signed_gcs_id); // single use

    const asset = { signed_gcs_id: target.signed_gcs_id, title: record.title };
    if (target.multipart_upload_id) asset.multipart_upload_id = target.multipart_upload_id;
    if (record.collection_token) asset.collection_token = record.collection_token;

    const r = await fetch(`${API}/assets/upload_complete`, {
      method: "POST",
      headers: pbHeaders(),
      body: JSON.stringify({ asset }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream failed" });
    res.json((await r.json()).data); // the created asset
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
});

app.listen(3000, () => console.log("upload-target backend on :3000"));
