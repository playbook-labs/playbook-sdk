// Dependency-free smoke tests for the built picker UMD bundle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Picker = require("../dist/playbook-picker.min.js");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("exposes the expected public surface", () => {
  assert.equal(typeof Picker.open, "function");
  assert.equal(typeof Picker.close, "function");
});

test("reports a version that matches package.json", () => {
  assert.equal(Picker.version, pkg.version);
});

test("close() is a no-op before open()", () => {
  assert.doesNotThrow(() => Picker.close());
});

test("open() without credentials is a no-op (returns before any DOM work)", () => {
  assert.doesNotThrow(() => Picker.open({}));
  assert.doesNotThrow(() => Picker.open({ organizationSlug: "demo" }));
});
