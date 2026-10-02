// Dependency-free smoke tests for the built UMD bundle.
// Covers the module surface and the config-validation paths that run before
// any DOM access. DOM-dependent rendering is exercised via the example apps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const SDK = require("../dist/playbook-sdk.min.js");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("exposes the expected public surface", () => {
  assert.equal(typeof SDK.init, "function");
  assert.equal(typeof SDK.destroy, "function");
  assert.equal(typeof SDK.getInstance, "function");
  assert.equal(typeof SDK.instances, "object");
});

test("reports a version that matches package.json", () => {
  assert.equal(typeof SDK.version, "string");
  assert.equal(SDK.version, pkg.version);
});

test("init() returns null when organizationSlug is missing", () => {
  assert.equal(SDK.init({ authToken: "t", containerId: "x" }), null);
});

test("init() returns null when no credential is provided", () => {
  assert.equal(SDK.init({ organizationSlug: "acme", containerId: "x" }), null);
});

test("init() rejects a non-function getAccessToken", () => {
  assert.equal(
    SDK.init({ organizationSlug: "acme", containerId: "x", getAccessToken: "nope" }),
    null
  );
});

test("getInstance() returns null for an unknown container", () => {
  assert.equal(SDK.getInstance("does-not-exist"), null);
});
