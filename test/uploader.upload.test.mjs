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

// Records every request. Each one succeeds on the next tick unless `hold` is
// set, which leaves it in flight.
class FakeXHR {
  static sent = [];
  static hold = false;
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
    return name === "Location" ? "https://storage.test/session" : null;
  }
  send(body) {
    this.body = body;
    FakeXHR.sent.push(this);
    if (FakeXHR.hold) return;
    setTimeout(() => {
      this.status = 200;
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
  const seen = { prepared: [], finished: [], completed: [], errors: [] };
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
