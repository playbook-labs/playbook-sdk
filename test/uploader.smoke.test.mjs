// Dependency-free smoke tests for the built uploader UMD bundle.
// Covers the module surface and the config-validation paths that run before
// any DOM access. DOM-dependent rendering is exercised via the example app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Uploader = require("../dist/playbook-uploader.min.js");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("exposes the expected public surface", () => {
  assert.equal(typeof Uploader.init, "function");
  assert.equal(typeof Uploader.destroy, "function");
  assert.equal(typeof Uploader.instances, "object");
});

test("reports a version that matches package.json", () => {
  assert.equal(Uploader.version, pkg.version);
});

test("init() returns null when getUploadTarget is missing", () => {
  assert.equal(Uploader.init({ containerId: "x" }), null);
});

test("init() returns null when getUploadTarget is not a function", () => {
  assert.equal(
    Uploader.init({ containerId: "x", getUploadTarget: "nope" }),
    null
  );
});
