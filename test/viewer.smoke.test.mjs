// Dependency-free smoke tests for the built viewer UMD bundle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Viewer = require("../dist/playbook-viewer.min.js");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("exposes the expected public surface", () => {
  assert.equal(typeof Viewer.open, "function");
  assert.equal(typeof Viewer.close, "function");
  assert.equal(typeof Viewer.next, "function");
  assert.equal(typeof Viewer.prev, "function");
});

test("reports a version that matches package.json", () => {
  assert.equal(Viewer.version, pkg.version);
});

test("close() is a no-op before open()", () => {
  assert.doesNotThrow(() => Viewer.close());
});
