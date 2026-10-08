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
 *   4. Decide title/type/board HERE (bound at prepare, keyed by signed_gcs_id)
 *      and re-read them at complete — never trust the browser's echo for those.
 *      signed_gcs_id / multipart_upload_id are passed back by the browser but
 *      are verified by the Playbook API, so a forged one fails.
 *
 * Node 18+, no dependencies:
 *   PLAYBOOK_TOKEN=... PLAYBOOK_ORG=... node examples/backend/upload-target.mjs
 */
import { createServer } from "node:http";

const PLAYBOOK_TOKEN = process.env.PLAYBOOK_TOKEN; // write scope — server-side only
const ORG = process.env.PLAYBOOK_ORG; // workspace slug
const BOARD = process.env.PLAYBOOK_BOARD || ""; // optional: file uploads into this board
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ""; // e.g. https://app.example.com
const PORT = process.env.PORT || 3000;
const API = `https://api.playbook.com/v1/${ORG}`;

const ALLOWED_TYPES = [/^image\//, /^video\//];
const MAX_BODY_BYTES = 16 * 1024;

// What we validated/decided at prepare, keyed by the signed id. Complete reads
// title/type/board from here, not from the browser. Use a TTL store in production.
const pending = new Map();

// STUB — replace with a real check that returns true for a signed-in caller.
// Shipped as a hard 501 so a copy-paste integrator cannot accidentally run an
// open endpoint.
function requireAuth(req, res) {
  send(res, 501, { error: "implement requireAuth before using this backend" });
  return false;
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) throw new Error("body too large");
  }
  return JSON.parse(raw || "{}");
}

function playbook(path, asset) {
  return fetch(`${API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PLAYBOOK_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ asset }),
  });
}

// Step 1 — prepare. Validate hard, then ask Playbook for the signed target.
async function prepare(body, res) {
  const { filename, mediaType } = body;
  const size = Number(body.size);
  if (typeof filename !== "string" || !filename) {
    return send(res, 400, { error: "filename required" });
  }
  if (typeof mediaType !== "string" || !ALLOWED_TYPES.some((re) => re.test(mediaType))) {
    return send(res, 415, { error: "unsupported media type" });
  }
  if (!Number.isInteger(size) || size <= 0) {
    return send(res, 400, { error: "invalid size" });
  }

  const upstream = await playbook("assets/upload_prepare", {
    title: filename,
    media_type: mediaType,
    size,
    collection_token: BOARD || undefined,
  });
  if (!upstream.ok) return send(res, 502, { error: "upstream failed" });
  const { data } = await upstream.json();

  // Bind title/type/board to this upload; complete looks them up by signed id.
  pending.set(data.signed_gcs_id, {
    title: filename,
    media_type: mediaType,
    collection_token: data.collection_token || BOARD || undefined,
  });

  // The browser needs the whole prepare response to perform the transfer.
  // None of it is secret (signed URLs + opaque metadata).
  send(res, 200, data);
}

// Step 2 — complete. The browser sends the target back; we use OUR stored
// title/type/board and the signed ids (which Playbook verifies).
async function complete(body, res) {
  const target = body.target || {};
  const record = pending.get(target.signed_gcs_id);
  if (!record) {
    return send(res, 409, { error: "unknown or already-used upload" });
  }
  // Single use: claimed now, restored below if Playbook does not confirm, so
  // a failed complete can be retried.
  pending.delete(target.signed_gcs_id);

  try {
    const upstream = await playbook("assets/upload_complete", {
      ...record,
      signed_gcs_id: target.signed_gcs_id,
      multipart_upload_id: target.multipart_upload_id || undefined,
    });
    if (!upstream.ok) throw new Error("upstream failed");
    send(res, 200, (await upstream.json()).data); // the created asset
  } catch (e) {
    pending.set(target.signed_gcs_id, record);
    send(res, 502, { error: "upstream failed" });
  }
}

const routes = {
  "/playbook/upload-target": prepare,
  "/playbook/finish-upload": complete,
};

createServer(async (req, res) => {
  if (ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const handler = req.method === "POST" && routes[req.url];
  if (!handler) {
    res.writeHead(404).end();
    return;
  }
  if (!requireAuth(req, res)) return;

  try {
    const body = await readJson(req).catch(() => null);
    if (!body) return send(res, 400, { error: "invalid request body" });
    await handler(body, res);
  } catch (e) {
    send(res, 500, { error: "server error" });
  }
}).listen(PORT, () => console.log(`upload-target backend on :${PORT}`));
