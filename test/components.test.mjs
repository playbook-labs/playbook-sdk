// How the built picker, player, embed and search bundles behave, driven through
// a stub DOM and a stub fetch: what they request, what they mount, and what
// they do with a response that arrives late.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Search = require("../dist/playbook-search.min.js");
const Picker = require("../dist/playbook-picker.min.js");
const Player = require("../dist/playbook-player.min.js");
const Embed = require("../dist/playbook-embed.min.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// What the stub browser can do; each test sets what it needs.
const browser = { hls: false, autoplayBlocked: false };

// A stub element: records children and listeners so a test can inspect what
// was mounted and fire events by hand. querySelector always finds a child.
function element(tag = "div") {
  const found = {};
  let html = "";
  return {
    tag,
    children: [],
    listeners: {},
    paused: true,
    classList: { add() {}, remove() {} },
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = value;
      this.children = [];
    },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    },
    querySelector: (selector) => (found[selector] ||= element()),
    querySelectorAll: () => [],
    setAttribute() {},
    removeAttribute() {},
    remove() {},
    canPlayType: () => (browser.hls ? "maybe" : ""),
    play: () => (browser.autoplayBlocked ? Promise.reject(new Error("blocked")) : Promise.resolve()),
    pause() {},
    load() {},
  };
}

let containers = {};
const body = element("body");
globalThis.document = {
  // The "…-styles" ids are the injected stylesheets: report them as present.
  getElementById: (id) => (id.endsWith("-styles") ? {} : (containers[id] ||= element())),
  createElement: element,
  head: { appendChild() {} },
  body,
  addEventListener() {},
  removeEventListener() {},
};
console.error = () => {};

// Records every request as { url, authorization }. `respond` decides each
// response: (request, index) => { status, delay, body }. Aborting a request
// rejects it, as fetch does.
function stubFetch(respond = () => ({})) {
  const requests = [];
  globalThis.fetch = (url, opts) =>
    new Promise((resolve, reject) => {
      const aborted = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (opts.signal?.aborted) return aborted();
      opts.signal?.addEventListener("abort", aborted);
      const request = { url: new URL(url), authorization: opts.headers.Authorization };
      const index = requests.push(request) - 1;
      const { status = 200, delay = 0, body = { data: [] } } = respond(request, index);
      setTimeout(() => resolve({ ok: status === 200, status, json: async () => body }), delay);
    });
  return requests;
}

const access = { organizationSlug: "acme", getAccessToken: async () => "token" };
const queryOf = (request) => request.url.searchParams.get("query");
const video = {
  token: "vid",
  title: "Launch",
  media_type: "video/mp4",
  display_url: "https://cdn.test/poster.webp",
  stream_url: "https://cdn.test/master.m3u8",
};
// Answers the asset read with `asset` and its /download with the original file.
const serveAsset = (asset) => ({ url }) => ({
  body: {
    data: url.pathname.endsWith("/download") ? { raw_url: "https://cdn.test/original.mp4" } : asset,
  },
});

function startSearch(config) {
  const results = [];
  const search = Search.init({
    containerId: "search",
    ...access,
    onResults: (assets, meta) => results.push({ assets, ...meta }),
    ...config,
  });
  return { search, results, input: containers.search.children[0] };
}

test("search uses the search endpoint, scoped to the board by its token", async () => {
  const requests = stubFetch(({ url }) =>
    url.pathname === "/v1/acme/boards/42" ? { body: { data: { token: "board-token" } } } : {}
  );
  const { search } = startSearch({ boardId: "42" });

  await search.search("logo");
  await search.search("");

  const [, found, listed] = requests;
  assert.equal(found.url.pathname, "/v1/acme/search");
  assert.equal(queryOf(found), "logo");
  assert.deepEqual(found.url.searchParams.getAll("filters[recursive_boards][]"), ["board-token"]);
  assert.equal(listed.url.pathname, "/v1/acme/boards/42/assets");
});

test("search delivers only the newest query when an older one answers last", async () => {
  stubFetch((request) => ({ delay: queryOf(request) === "ab" ? 60 : 10 }));
  const { search, results } = startSearch();

  search.search("a");
  await sleep(1);
  search.search("ab");
  await sleep(1);
  search.search("abc");
  await sleep(100);

  assert.deepEqual(results.map((r) => r.query), ["abc"]);
});

test("clearing the search input cancels the query in flight", async () => {
  stubFetch(() => ({ delay: 40, body: { data: [{ token: "a1" }] } }));
  const { input, results } = startSearch({ debounceMs: 0 });

  input.value = "logo";
  input.listeners.input();
  await sleep(10);
  input.value = "";
  input.listeners.input();
  await sleep(80);

  assert.deepEqual(results.map((r) => [r.query, r.assets.length]), [["", 0]]);
});

test("search reports the total and the page from the response's pagy", async () => {
  const requests = stubFetch(() => ({
    body: { data: [{ token: "a1" }], pagy: { current_page: 2, total_pages: 8, total_count: 400 } },
  }));
  const { search, results } = startSearch();

  await search.search("logo", 2);

  assert.equal(requests[0].url.searchParams.get("page"), "2");
  assert.deepEqual(
    { total: results[0].total, page: results[0].page, totalPages: results[0].totalPages },
    { total: 400, page: 2, totalPages: 8 }
  );
});

test("every component sends nothing when the provider returns something other than a token string", async () => {
  const starts = {
    search: (getAccessToken) => startSearch({ getAccessToken }).search.search("logo"),
    picker: (getAccessToken) => Picker.open({ ...access, getAccessToken }),
    player: (getAccessToken) => Player.init({ containerId: "player", ...access, getAccessToken, assetToken: "vid" }),
    embed: (getAccessToken) => Embed.init({ containerId: "embed", ...access, getAccessToken, assetToken: "img" }),
  };
  for (const [name, start] of Object.entries(starts)) {
    for (const value of [{ token: "t" }, "", null, undefined]) {
      const requests = stubFetch();
      start(async () => value);
      await sleep(10);

      assert.deepEqual(requests, [], `${name} sent a request for ${JSON.stringify(value)}`);
    }
  }
  Picker.close();
});

test("refreshes the token after a 401 and retries the request once", async () => {
  let calls = 0;
  const requests = stubFetch(({ authorization }) => ({ status: authorization === "Bearer token-1" ? 401 : 200 }));
  const { search } = startSearch({ getAccessToken: async () => `token-${++calls}` });

  await search.search("logo");

  assert.deepEqual(requests.map((r) => r.authorization), ["Bearer token-1", "Bearer token-2"]);
});

test("picker loads further pages on demand and appends them", async () => {
  const requests = stubFetch(({ url }) =>
    url.searchParams.get("page") === "1"
      ? { body: { data: [{ token: "a1" }, { token: "a2" }], pagy: { current_page: 1, total_pages: 2 } } }
      : { body: { data: [{ token: "a3" }], pagy: { current_page: 2, total_pages: 2 } } }
  );
  Picker.open({ ...access, perPage: 2 });
  await sleep(10);
  const overlay = body.children.at(-1);
  const grid = overlay.querySelector(".pb-picker-grid");
  assert.match(grid.innerHTML, /pb-picker-more/);

  grid.querySelector(".pb-picker-more").listeners.click();
  await sleep(10);

  assert.equal(requests[1].url.searchParams.get("page"), "2");
  assert.equal(grid.innerHTML.match(/pb-picker-cell"/g).length, 3);
  assert.doesNotMatch(grid.innerHTML, /pb-picker-more/);
  Picker.close();
});

test("picker searches through the search endpoint and escapes asset titles", async () => {
  const requests = stubFetch(() => ({
    body: { data: [{ token: "a1", title: '"><img src=x onerror=alert(1)>' }] },
  }));
  Picker.open({ ...access, boardId: "brand" });
  await sleep(10);
  const overlay = body.children.at(-1);
  const input = overlay.querySelector(".pb-picker-search");

  input.value = "logo";
  input.listeners.input();
  await sleep(300);

  const found = requests.at(-1);
  assert.equal(found.url.pathname, "/v1/acme/search");
  assert.equal(queryOf(found), "logo");
  const html = overlay.querySelector(".pb-picker-grid").innerHTML;
  assert.doesNotMatch(html, /"><img/);
  assert.match(html, /&quot;&gt;&lt;img/);
  Picker.close();
});

function startPlayer(config) {
  containers = {};
  const calls = { ready: [], errors: [] };
  const player = Player.init({
    containerId: "player",
    onReady: (asset) => calls.ready.push(asset),
    onError: (error) => calls.errors.push(error),
    ...config,
  });
  return { player, calls, container: containers.player };
}

test("player plays the asset's HLS stream where the browser supports it", async () => {
  browser.hls = true;
  const requests = stubFetch(serveAsset(video));
  const { container } = startPlayer({ ...access, assetToken: "vid" });
  await sleep(10);
  browser.hls = false;

  const [mounted, poster] = container.children;
  assert.equal(requests.length, 1);
  assert.equal(mounted.src, video.stream_url);
  assert.equal(poster.src, video.display_url);
});

test("player falls back to the original file without native HLS, never the poster", async () => {
  const requests = stubFetch(serveAsset(video));
  const { container } = startPlayer({ ...access, assetToken: "vid" });
  await sleep(10);

  assert.equal(requests[1].url.pathname, "/v1/acme/assets/vid/download");
  assert.equal(container.children[0].src, "https://cdn.test/original.mp4");
});

test("player mounts nothing once destroyed while its asset is loading", async () => {
  stubFetch((request) => ({ delay: 30, ...serveAsset(video)(request) }));
  const { container, calls } = startPlayer({ ...access, assetToken: "vid" });

  Player.destroy("player");
  await sleep(100);

  assert.deepEqual(container.children, []);
  assert.deepEqual(calls, { ready: [], errors: [] });
});

test("player is ready once metadata loads and reports a video that fails to load", async () => {
  const { container, calls } = startPlayer({ src: "https://cdn.test/clip.mp4" });
  const mounted = container.children[0];
  assert.deepEqual(calls.ready, []);

  mounted.listeners.loadedmetadata();
  assert.deepEqual(calls.ready, [null]);

  mounted.listeners.error();
  assert.equal(calls.errors.length, 1);
  assert.match(container.innerHTML, /pb-player-error/);
});

test("player shows the play overlay when the browser blocks autoplay", async () => {
  browser.autoplayBlocked = true;
  const { container } = startPlayer({ src: "https://cdn.test/clip.mp4", autoplay: true, controls: false });
  await sleep(10);
  browser.autoplayBlocked = false;

  assert.deepEqual(container.children.map((child) => child.className), ["pb-player-video", "pb-player-play"]);
});

function startEmbed(config) {
  const calls = { loaded: [], errors: [] };
  Embed.init({
    containerId: "embed",
    onLoad: (asset) => calls.loaded.push(asset),
    onError: (error) => calls.errors.push(error),
    ...config,
  });
  return { calls, container: containers.embed };
}

test("embed picks video or image for a direct src from its extension", () => {
  for (const [src, tag] of [
    ["https://cdn.test/clip.mp4", "video"],
    ["https://cdn.test/clip.mp4?signature=abc", "video"],
    ["https://cdn.test/photo.jpg", "img"],
  ]) {
    containers = {};
    const { container } = startEmbed({ src });

    assert.equal(container.children[0].tag, tag, src);
  }
});

test("embed plays a video asset from its file, with display_url as the poster", async () => {
  containers = {};
  stubFetch(serveAsset(video));
  const { container } = startEmbed({ ...access, assetToken: "vid" });
  await sleep(10);

  const mounted = container.children[0];
  assert.equal(mounted.tag, "video");
  assert.equal(mounted.src, "https://cdn.test/original.mp4");
  assert.equal(mounted.poster, video.display_url);
});

test("embed reports an image as loaded only once it has loaded", async () => {
  containers = {};
  const image = { token: "img", media_type: "image/jpeg", display_url: "https://cdn.test/hero.jpg" };
  const requests = stubFetch(serveAsset(image));
  const { container, calls } = startEmbed({ ...access, assetToken: "img" });
  await sleep(10);

  const mounted = container.children[0];
  assert.equal(requests.length, 1);
  assert.equal(mounted.src, image.display_url);
  assert.deepEqual(calls.loaded, []);

  mounted.listeners.load();
  assert.deepEqual(calls.loaded, [image]);

  mounted.listeners.error();
  assert.equal(calls.errors.length, 1);
});

test("embed keeps the newer media when a replaced embed's asset answers late", async () => {
  containers = {};
  stubFetch((request) => ({ delay: 30, ...serveAsset(video)(request) }));
  startEmbed({ ...access, assetToken: "vid" });

  const { container } = startEmbed({ src: "https://cdn.test/photo.jpg" });
  await sleep(100);

  assert.deepEqual(container.children.map((child) => child.src), ["https://cdn.test/photo.jpg"]);
});
