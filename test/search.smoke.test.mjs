// Dependency-free smoke tests for the built search UMD bundle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Search = require("../dist/playbook-search.min.js");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("exposes the expected public surface", () => {
  assert.equal(typeof Search.init, "function");
  assert.equal(typeof Search.destroy, "function");
});

test("reports a version that matches package.json", () => {
  assert.equal(Search.version, pkg.version);
});

test("init() returns null without organizationSlug", () => {
  assert.equal(Search.init({}), null);
});

test("init() returns null without getAccessToken", () => {
  assert.equal(Search.init({ organizationSlug: "demo" }), null);
});

test("init() returns null without onResults", () => {
  assert.equal(Search.init({ organizationSlug: "demo", getAccessToken: () => "t" }), null);
});
