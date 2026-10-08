// Dependency-free smoke tests for the built embed UMD bundle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Embed = require("../dist/playbook-embed.min.js");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("exposes the expected public surface", () => {
  assert.equal(typeof Embed.init, "function");
  assert.equal(typeof Embed.destroy, "function");
});

test("reports a version that matches package.json", () => {
  assert.equal(Embed.version, pkg.version);
});

test("init() returns null when the container is missing", () => {
  const prev = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    assert.equal(Embed.init({ containerId: "nope", src: "photo.jpg" }), null);
  } finally {
    globalThis.document = prev;
  }
});
