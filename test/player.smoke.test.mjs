// Dependency-free smoke tests for the built player UMD bundle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Player = require("../dist/playbook-player.min.js");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("exposes the expected public surface", () => {
  assert.equal(typeof Player.init, "function");
  assert.equal(typeof Player.destroy, "function");
});

test("reports a version that matches package.json", () => {
  assert.equal(Player.version, pkg.version);
});

test("init() returns null when the container is missing", () => {
  const prev = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    assert.equal(Player.init({ containerId: "nope", src: "clip.mp4" }), null);
  } finally {
    globalThis.document = prev;
  }
});
