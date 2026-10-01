// What the built bundle sends to the API, driven through a stub DOM and a stub
// fetch: when the token provider is asked for a token, and how search is scoped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SDK = require("../dist/playbook-sdk.min.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const container = {
  classList: { add() {}, remove() {} },
  insertAdjacentHTML() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  innerHTML: "",
};
globalThis.document = {
  getElementById: (id) => (id === "gallery" ? container : null),
  createElement: () => ({}),
  head: { appendChild() {} },
  body: { style: {} },
  querySelector: () => null,
  addEventListener() {},
  removeEventListener() {},
};
console.error = () => {};
console.warn = () => {};

// Starts a gallery and records every request as { url, authorization }. With a
// boardId it fires three requests at once (board, child boards, assets).
// `respond` decides each response: (request, index) => { status, delay, body }.
// `then` runs against the gallery once those first requests have settled.
async function startGallery({ config, respond = () => ({}), then }) {
  const requests = [];
  globalThis.fetch = async (url, opts) => {
    const request = { url: new URL(url), authorization: opts.headers.Authorization };
    const index = requests.push(request) - 1;
    const { status = 200, delay = 0, body = { data: [] } } = respond(request, index);
    await sleep(delay);
    return {
      ok: status === 200,
      status,
      statusText: String(status),
      headers: { get: () => "application/json" },
      json: async () => body,
    };
  };

  const gallery = SDK.init({ containerId: "gallery", organizationSlug: "acme", ...config });
  await sleep(150);
  if (then) {
    await then(gallery);
    await sleep(50);
  }
  SDK.destroy("gallery");
  return requests;
}

const authorizations = (requests) => requests.map((request) => request.authorization);

// A provider that hands out "token-1", "token-2", ... and counts its calls.
function countingProvider() {
  const provider = async () => {
    provider.calls += 1;
    await sleep(5);
    return `token-${provider.calls}`;
  };
  provider.calls = 0;
  return provider;
}

test("asks the provider once for the requests fired at startup", async () => {
  const getAccessToken = countingProvider();

  const requests = await startGallery({ config: { getAccessToken, boardId: "b1" } });

  assert.equal(getAccessToken.calls, 1);
  assert.deepEqual(authorizations(requests), ["Bearer token-1", "Bearer token-1", "Bearer token-1"]);
});

test("refreshes the token after a 401 and retries the request with it", async () => {
  const getAccessToken = countingProvider();

  const requests = await startGallery({
    config: { getAccessToken, boardId: "b1" },
    respond: ({ authorization }) => ({ status: authorization === "Bearer token-1" ? 401 : 200 }),
  });

  assert.equal(getAccessToken.calls, 2);
  assert.deepEqual(authorizations(requests).slice(3), ["Bearer token-2", "Bearer token-2", "Bearer token-2"]);
});

test("refreshes once when the 401s arrive one after another", async () => {
  const getAccessToken = countingProvider();

  const requests = await startGallery({
    config: { getAccessToken, boardId: "b1" },
    respond: ({ authorization }, index) =>
      authorization === "Bearer token-1" ? { status: 401, delay: index * 30 } : {},
  });

  assert.equal(getAccessToken.calls, 2);
  assert.deepEqual(authorizations(requests).slice(3), ["Bearer token-2", "Bearer token-2", "Bearer token-2"]);
});

test("retries a request only once when the server keeps answering 401", async () => {
  const requests = await startGallery({
    config: { getAccessToken: countingProvider(), boardId: "b1" },
    respond: () => ({ status: 401 }),
  });

  assert.equal(requests.length, 6);
});

test("sends nothing when the provider returns something other than a token string", async () => {
  for (const value of [{ token: "t" }, "", null, undefined]) {
    const requests = await startGallery({ config: { getAccessToken: async () => value, boardId: "b1" } });

    assert.deepEqual(requests, [], `sent a request for ${JSON.stringify(value)}`);
  }
});

test("still accepts the deprecated static authToken", async () => {
  const requests = await startGallery({ config: { authToken: "static", boardId: "b1" } });

  assert.deepEqual(authorizations(requests), ["Bearer static", "Bearer static", "Bearer static"]);
});

const boardFilter = (request) => request.url.searchParams.getAll("filters[recursive_boards][]");

test("keeps search and AI search inside the root board", async () => {
  const requests = await startGallery({
    config: { getAccessToken: countingProvider(), boardId: "b1" },
    then: async (gallery) => {
      gallery.search("logo");
      await sleep(50);
      gallery.useAiSearch = true;
      gallery.search("logo");
    },
  });

  const [search, aiSearch] = requests.slice(-2);
  assert.equal(search.url.pathname, "/v1/acme/search");
  assert.deepEqual(boardFilter(search), ["b1"]);
  assert.equal(aiSearch.url.pathname, "/v1/acme/ai_search");
  assert.deepEqual(boardFilter(aiSearch), ["b1"]);
});

test("filters search by the root board's token when boardId is a numeric id", async () => {
  const requests = await startGallery({
    config: { getAccessToken: countingProvider(), boardId: "42" },
    respond: ({ url }) =>
      url.pathname === "/v1/acme/boards/42" ? { body: { data: { token: "board-token", title: "Lookbook" } } } : {},
    then: (gallery) => gallery.search("logo"),
  });

  assert.deepEqual(boardFilter(requests.at(-1)), ["board-token"]);
});

test("does not filter search by board when the gallery has no root board", async () => {
  const requests = await startGallery({
    config: { getAccessToken: countingProvider() },
    then: (gallery) => gallery.search("logo"),
  });

  assert.equal(requests.at(-1).url.pathname, "/v1/acme/search");
  assert.deepEqual(boardFilter(requests.at(-1)), []);
});
