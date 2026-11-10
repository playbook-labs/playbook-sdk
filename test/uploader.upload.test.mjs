// What the built uploader bundle does with a selection, driven through a stub
// DOM and a stub XMLHttpRequest: which requests each storage provider gets, and
// how the queue, the hooks and destroy() behave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Uploader = require("../dist/playbook-uploader.min.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => sleep(30);

function element() {
  return {
    style: {},
    children: [],
    listeners: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(evt, fn) {
      (this.listeners[evt] = this.listeners[evt] || []).push(fn);
    },
    removeEventListener() {},
    click() {},
  };
}
const container = element();
globalThis.document = {
  getElementById: (id) => (id === "uploader" ? container : null),
  createElement: element,
  head: { appendChild() {} },
};
console.error = () => {};

// Records every request. Each one answers on the next tick with `status` (and
// `location` as its Location header) unless `hold` is set, which leaves it in
// flight. `respond(xhr)`, when set, decides the answer instead: { status,
// range } or "error" for a network error.
class FakeXHR {
  static sent = [];
  static hold = false;
  static status = 200;
  static location = "https://storage.test/session";
  static respond = null;
  upload = {};
  headers = {};
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name, value) {
    this.headers[name] = value;
  }
  getResponseHeader(name) {
    if (name === "Location") return FakeXHR.location;
    if (name === "Range") return this.range || null;
    return null;
  }
  send(body) {
    this.body = body;
    FakeXHR.sent.push(this);
    if (FakeXHR.hold) return;
    setTimeout(() => {
      const reply = FakeXHR.respond ? FakeXHR.respond(this) : { status: FakeXHR.status };
      if (reply === "error") {
        this.onerror?.();
        this.onloadend?.();
        return;
      }
      const size = body ? body.size : 0;
      this.upload.onprogress?.({ lengthComputable: true, loaded: size, total: size });
      this.status = reply.status;
      this.range = reply.range;
      this.onload?.();
      this.onloadend?.();
    }, 0);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
    this.onloadend?.();
  }
}
globalThis.XMLHttpRequest = FakeXHR;

const file = (name, { size = 4, type = "image/png" } = {}) => ({
  name,
  size,
  type,
  slice: (start, end) => ({ size: end - start }),
});

const gcsTarget = {
  storage_provider: "gcs",
  upload_url: "https://storage.test/init",
  signed_gcs_id: "signed",
  encrypted_organization_metadata: "meta",
  file_extension: ".png",
};

// Starts an uploader whose backend callbacks succeed, recording what they and
// the hooks receive. `config` overrides any of it.
function start(config = {}) {
  FakeXHR.sent = [];
  FakeXHR.hold = false;
  FakeXHR.status = 200;
  FakeXHR.location = "https://storage.test/session";
  FakeXHR.respond = null;
  const seen = { prepared: [], finished: [], completed: [], errors: [], progress: [] };
  const uploader = Uploader.init({
    containerId: "uploader",
    getUploadTarget: async (f) => {
      seen.prepared.push(f.name);
      return gcsTarget;
    },
    finishUpload: async (target, f) => {
      seen.finished.push(target);
      return { id: f.name };
    },
    onComplete: (assets) => seen.completed.push(assets.map((asset) => asset.id)),
    onError: (error, f) => seen.errors.push(f.name),
    onProgress: (f, pct) => seen.progress.push(`${f.name} ${pct}`),
    ...config,
  });
  return { uploader, seen };
}

const fire = (el, evt, event) => el.listeners[evt].forEach((fn) => fn(event));
const drop = (uploader, files) =>
  fire(uploader.trigger, "drop", { preventDefault() {}, dataTransfer: { files } });
const pick = (uploader, files) => {
  uploader.input.files = files;
  fire(uploader.input, "change");
};
const requests = () => FakeXHR.sent.map((xhr) => `${xhr.method} ${xhr.url}`);

test("gcs: starts a resumable session, then PUTs the bytes to it", async () => {
  const { uploader, seen } = start();

  drop(uploader, [file("a.png")]);
  await settle();

  assert.deepEqual(requests(), ["POST https://storage.test/init", "PUT https://storage.test/session"]);
  assert.equal(FakeXHR.sent[0].headers["x-goog-resumable"], "start");
  assert.equal(FakeXHR.sent[0].headers["x-goog-meta-encrypted-organization-metadata"], "meta");
  assert.equal(FakeXHR.sent[0].headers["x-goog-meta-extension"], ".png");
  assert.deepEqual(seen.finished, [gcsTarget]);
  assert.deepEqual(seen.completed, [["a.png"]]);
  uploader.destroy();
});

test("sends the media type the target was signed for, not the browser's file.type", async () => {
  const { uploader } = start({
    getUploadTarget: async () => ({ ...gcsTarget, media_type: "image/heic" }),
  });

  pick(uploader, [file("IMG_0001.heic", { type: "" })]);
  await settle();

  // The session itself expects text/plain chunks.
  assert.deepEqual(
    FakeXHR.sent.map((xhr) => xhr.headers["Content-Type"]),
    ["image/heic", "text/plain"]
  );
  uploader.destroy();
});

const MiB = 1024 * 1024;
const CHUNK = 16 * MiB;

// A fake GCS resumable session. A chunk PUT persists `keep(start, end)` bytes
// in total (default: all of it); a status query reports what is held.
// `fail(xhr)` returns a status or "error" to fail a request before it lands.
function gcsSession({ keep, fail, finalStatus = 200 } = {}) {
  let held = 0;
  return (xhr) => {
    if (xhr.method === "POST") return { status: 201 };
    const failure = fail?.(xhr);
    if (failure) return failure === "error" ? "error" : { status: failure };
    const [, start, end, total] = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+|\*)$/.exec(
      xhr.headers["Content-Range"]
    );
    if (start !== undefined) {
      held = keep ? keep(Number(start), Number(end)) : Number(end) + 1;
    }
    if (total !== "*" && held === Number(total)) return { status: finalStatus };
    return { status: 308, range: held ? `bytes=0-${held - 1}` : null };
  };
}

const puts = () =>
  FakeXHR.sent.filter((xhr) => xhr.method === "PUT").map((xhr) => xhr.headers["Content-Range"]);

// Starts an uploader against a fake GCS session, with retries that do not wait.
function startGcs(session, config) {
  const run = start(config);
  run.uploader._backoff = async () => {};
  FakeXHR.respond = session;
  return run;
}

test("gcs: a file that is not a multiple of the chunk size ends with a short chunk carrying the total", async () => {
  const { uploader, seen } = startGcs(gcsSession());
  const size = 2 * CHUNK + 5 * MiB;

  drop(uploader, [file("clip.mp4", { size, type: "video/mp4" })]);
  await settle();

  assert.deepEqual(puts(), [
    `bytes 0-${CHUNK - 1}/*`,
    `bytes ${CHUNK}-${2 * CHUNK - 1}/*`,
    `bytes ${2 * CHUNK}-${size - 1}/${size}`,
  ]);
  const chunks = FakeXHR.sent.slice(1);
  assert.deepEqual(chunks.map((xhr) => xhr.body.size), [CHUNK, CHUNK, 5 * MiB]);
  assert.ok(chunks.every((xhr) => xhr.headers["Content-Type"] === "text/plain"));
  // The last chunk waits for the stored object, so upload_complete finds it.
  assert.deepEqual(
    chunks.map((xhr) => xhr.headers["x-pb-await-completion"]),
    ["false", "false", undefined]
  );
  assert.deepEqual(seen.completed, [["clip.mp4"]]);
  uploader.destroy();
});

test("gcs: a file smaller than one chunk is a single PUT with the total", async () => {
  const { uploader, seen } = startGcs(gcsSession());

  drop(uploader, [file("a.png", { size: 10 })]);
  await settle();

  assert.deepEqual(puts(), ["bytes 0-9/10"]);
  assert.deepEqual(seen.completed, [["a.png"]]);
  uploader.destroy();
});

test("gcs: an exact multiple of the chunk size sends no empty trailing chunk", async () => {
  const { uploader, seen } = startGcs(gcsSession());
  const size = 2 * CHUNK;

  drop(uploader, [file("clip.mp4", { size, type: "video/mp4" })]);
  await settle();

  assert.deepEqual(puts(), [`bytes 0-${CHUNK - 1}/*`, `bytes ${CHUNK}-${size - 1}/${size}`]);
  assert.deepEqual(seen.completed, [["clip.mp4"]]);
  uploader.destroy();
});

test("gcs: an empty file is one PUT of bytes */0", async () => {
  const { uploader, seen } = startGcs(gcsSession());

  drop(uploader, [file("empty.png", { size: 0 })]);
  await settle();

  assert.deepEqual(puts(), ["bytes */0"]);
  assert.deepEqual(seen.completed, [["empty.png"]]);
  uploader.destroy();
});

test("gcs: continues from the 308 Range when storage keeps less than was sent", async () => {
  const size = CHUNK + 4 * MiB;
  const { uploader, seen } = startGcs(
    gcsSession({ keep: (start, end) => (start === 0 ? 4 * MiB : end + 1) })
  );

  drop(uploader, [file("clip.mp4", { size, type: "video/mp4" })]);
  await settle();

  assert.deepEqual(puts(), [`bytes 0-${CHUNK - 1}/*`, `bytes ${4 * MiB}-${size - 1}/${size}`]);
  assert.deepEqual(seen.completed, [["clip.mp4"]]);
  uploader.destroy();
});

test("gcs: after a failed chunk, a status query says where to resume", async () => {
  const size = CHUNK + 1 * MiB;
  const attempts = {};
  const { uploader, seen } = startGcs(
    gcsSession({
      // First chunk: 503 once. Second chunk: a network error once.
      fail: (xhr) => {
        const range = xhr.headers["Content-Range"];
        if (range.startsWith("bytes */")) return null;
        attempts[range] = (attempts[range] || 0) + 1;
        if (attempts[range] > 1) return null;
        return range.startsWith("bytes 0-") ? 503 : "error";
      },
    })
  );

  drop(uploader, [file("clip.mp4", { size, type: "video/mp4" })]);
  await settle();

  assert.deepEqual(puts(), [
    `bytes 0-${CHUNK - 1}/*`,
    `bytes */${size}`, // 308 without Range: nothing held, restart at 0
    `bytes 0-${CHUNK - 1}/*`,
    `bytes ${CHUNK}-${size - 1}/${size}`,
    `bytes */${size}`, // 308 with Range: the first chunk is held
    `bytes ${CHUNK}-${size - 1}/${size}`,
  ]);
  const query = FakeXHR.sent[2];
  assert.equal(query.body, null);
  assert.equal(query.headers["Content-Type"], undefined);
  assert.deepEqual(seen.errors, []);
  assert.deepEqual(seen.completed, [["clip.mp4"]]);
  uploader.destroy();
});

test("gcs: a status query answering 201 means the upload already completed", async () => {
  const size = 10;
  const { uploader, seen } = startGcs((xhr) => {
    if (xhr.method === "POST") return { status: 201 };
    // The final chunk lands but its response is lost.
    return xhr.headers["Content-Range"] === `bytes */${size}` ? { status: 201 } : "error";
  });

  drop(uploader, [file("a.png", { size })]);
  await settle();

  assert.deepEqual(puts(), [`bytes 0-9/${size}`, `bytes */${size}`]);
  assert.deepEqual(seen.completed, [["a.png"]]);
  uploader.destroy();
});

test("gcs: the final chunk may answer 201", async () => {
  const { uploader, seen } = startGcs(gcsSession({ finalStatus: 201 }));

  drop(uploader, [file("a.png", { size: CHUNK + 1 })]);
  await settle();

  assert.deepEqual(puts(), [`bytes 0-${CHUNK - 1}/*`, `bytes ${CHUNK}-${CHUNK}/${CHUNK + 1}`]);
  assert.deepEqual(seen.completed, [["a.png"]]);
  uploader.destroy();
});

test("gcs: gives up after the retries and never calls finishUpload", async () => {
  const { uploader, seen } = startGcs(gcsSession({ fail: () => 503 }));

  drop(uploader, [file("a.png", { size: 10 })]);
  await settle();

  assert.deepEqual(puts(), ["bytes 0-9/10", ...Array(8).fill("bytes */10")]);
  assert.deepEqual(seen.errors, ["a.png"]);
  assert.deepEqual(seen.finished, []);
  uploader.destroy();
});

test("gcs: a 4xx on a chunk fails the file without retrying", async () => {
  const { uploader, seen } = startGcs(gcsSession({ fail: () => 404 }));

  drop(uploader, [file("a.png", { size: 10 })]);
  await settle();

  assert.deepEqual(puts(), ["bytes 0-9/10"]);
  assert.deepEqual(seen.errors, ["a.png"]);
  assert.deepEqual(seen.finished, []);
  uploader.destroy();
});

test("gcs: a 308 that never advances fails the file instead of looping", async () => {
  // No Range is ever exposed, so every chunk looks unpersisted.
  const { uploader, seen } = startGcs((xhr) =>
    xhr.method === "POST" ? { status: 201 } : { status: 308 }
  );

  drop(uploader, [file("a.png", { size: CHUNK + 1 })]);
  await settle();

  assert.equal(puts().length, 17); // the chunk, then 8 × (query + chunk)
  assert.deepEqual(seen.errors, ["a.png"]);
  assert.deepEqual(seen.finished, []);
  uploader.destroy();
});

test("gcs: progress covers the whole file across chunks", async () => {
  const { uploader, seen } = startGcs(gcsSession());

  drop(uploader, [file("clip.mp4", { size: 4 * CHUNK, type: "video/mp4" })]);
  await settle();

  assert.deepEqual(seen.progress, [25, 50, 75, 100].map((pct) => `clip.mp4 ${pct}`));
  uploader.destroy();
});

test("reports upload progress", async () => {
  const { uploader, seen } = start();

  drop(uploader, [file("a.png")]);
  await settle();

  assert.deepEqual(seen.progress, ["a.png 100"]);
  uploader.destroy();
});

test("a storage error fails the file and never calls finishUpload", async () => {
  const { uploader, seen } = start();
  FakeXHR.status = 403;

  drop(uploader, [file("a.png")]);
  await settle();

  assert.deepEqual(requests(), ["POST https://storage.test/init"]);
  assert.deepEqual(seen.errors, ["a.png"]);
  assert.deepEqual(seen.finished, []);
  assert.deepEqual(seen.completed, [[]]);
  uploader.destroy();
});

test("gcs: fails when storage does not expose the session Location", async () => {
  const { uploader, seen } = start();
  FakeXHR.location = null;

  drop(uploader, [file("a.png")]);
  await settle();

  assert.deepEqual(requests(), ["POST https://storage.test/init"]);
  assert.deepEqual(seen.errors, ["a.png"]);
  assert.deepEqual(seen.finished, []);
  uploader.destroy();
});

test("backblaze: a single PUT that leaves out the extension header when there is none", async () => {
  const target = {
    storage_provider: "backblaze",
    upload_url: "https://b2.test/put",
    signed_gcs_id: "signed",
    encrypted_organization_metadata: "meta",
    file_extension: null,
  };
  const { uploader, seen } = start({ getUploadTarget: async () => target });

  drop(uploader, [file("IMG_1234")]);
  await settle();

  assert.deepEqual(requests(), ["PUT https://b2.test/put"]);
  assert.deepEqual(FakeXHR.sent[0].headers, {
    "Content-Type": "image/png",
    "x-amz-meta-encrypted-organization-metadata": "meta",
  });
  assert.deepEqual(seen.completed, [["IMG_1234"]]);
  uploader.destroy();
});

test("backblaze multipart: one PUT per part, in order, sliced by part_size", async () => {
  const target = {
    storage_provider: "backblaze",
    signed_gcs_id: "signed",
    multipart_upload_id: "mp",
    part_size: 5,
    parts: [3, 1, 2].map((n) => ({ part_number: n, url: `https://b2.test/part${n}` })),
  };
  const { uploader, seen } = start({ getUploadTarget: async () => target });

  drop(uploader, [file("clip.mp4", { size: 12, type: "video/mp4" })]);
  await settle();

  assert.deepEqual(requests(), [1, 2, 3].map((n) => `PUT https://b2.test/part${n}`));
  assert.deepEqual(FakeXHR.sent.map((xhr) => xhr.body.size), [5, 5, 2]);
  assert.deepEqual(seen.completed, [["clip.mp4"]]);
  uploader.destroy();
});

test("onComplete reports each batch on its own", async () => {
  const { uploader, seen } = start();

  drop(uploader, [file("a.png")]);
  await settle();
  drop(uploader, [file("b.png")]);
  await settle();

  assert.deepEqual(seen.completed, [["a.png"], ["b.png"]]);
  uploader.destroy();
});

test("a drop honours multiple: false", async () => {
  const { uploader, seen } = start({ multiple: false });

  drop(uploader, [file("a.png"), file("b.png")]);
  await settle();

  assert.deepEqual(seen.prepared, ["a.png"]);
  uploader.destroy();
});

test("a drop honours accept, and the rejected file gets a row", async () => {
  const { uploader, seen } = start();

  drop(uploader, [file("notes.pdf", { type: "application/pdf" })]);
  await settle();

  assert.deepEqual(seen.prepared, []);
  assert.deepEqual(seen.errors, ["notes.pdf"]);
  assert.equal(uploader.list.children.length, 1);
  uploader.destroy();
});

test("an oversized file fails with a row instead of silently", async () => {
  const { uploader, seen } = start({ maxFileSizeBytes: 10 });

  pick(uploader, [file("big.png", { size: 11 })]);
  await settle();

  assert.deepEqual(seen.prepared, []);
  assert.deepEqual(seen.errors, ["big.png"]);
  assert.equal(uploader.list.children.length, 1);
  uploader.destroy();
});

test("autoUpload: false waits for upload()", async () => {
  const { uploader, seen } = start({ autoUpload: false });

  pick(uploader, [file("a.png")]);
  await settle();
  assert.deepEqual(seen.prepared, []);

  uploader.upload();
  await settle();
  assert.deepEqual(seen.completed, [["a.png"]]);
  uploader.destroy();
});

test("concurrency: 0 is raised to 1 rather than queueing forever", async () => {
  const { uploader, seen } = start({ concurrency: 0 });

  drop(uploader, [file("a.png")]);
  await settle();

  assert.deepEqual(seen.completed, [["a.png"]]);
  uploader.destroy();
});

test("a throwing onError does not stall the queue", async () => {
  const { uploader, seen } = start({
    concurrency: 1,
    getUploadTarget: async (f) => {
      if (f.name === "bad.png") throw new Error("prepare failed");
      return gcsTarget;
    },
    onError: () => {
      throw new Error("hook failed");
    },
  });

  drop(uploader, [file("bad.png"), file("good.png")]);
  await settle();

  assert.deepEqual(seen.completed, [["good.png"]]);
  uploader.destroy();
});

test("a throwing onFileComplete leaves the upload counted as done", async () => {
  const { uploader, seen } = start({
    onFileComplete: () => {
      throw new Error("hook failed");
    },
  });

  drop(uploader, [file("a.png")]);
  await settle();

  assert.deepEqual(seen.errors, []);
  assert.deepEqual(seen.completed, [["a.png"]]);
  uploader.destroy();
});

test("destroy() aborts the transfer in flight and drops the queue", async () => {
  const { uploader, seen } = start({ concurrency: 1 });
  FakeXHR.hold = true;

  drop(uploader, [file("a.png"), file("b.png")]);
  await settle();
  uploader.destroy();
  await settle();

  assert.equal(FakeXHR.sent.length, 1);
  assert.equal(FakeXHR.sent[0].aborted, true);
  assert.deepEqual(seen.prepared, ["a.png"]);
  assert.deepEqual(seen.finished, []);
  assert.deepEqual(seen.errors, []);
  assert.deepEqual(seen.completed, []);
});
