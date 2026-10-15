/**
 * Playbook Search SDK
 *
 * A zero-dependency, headless search box for the Playbook media library. It
 * renders only an input — no results layout — and hands matches to your own UI
 * via onResults(assets, meta). Use it when you want Playbook's search but your
 * own result cards/grid/list.
 *
 * PlaybookSearch.init({ containerId, organizationSlug, getAccessToken,
 * onResults }) returns an instance with search(query, page) and destroy().
 *
 * Auth mirrors the gallery: getAccessToken is an async provider returning a
 * short-lived token; it is called on the first request and again on a 401. No
 * long-lived token is ever stored.
 *
 * Build with `npm run build`. `__PB_VERSION__` is replaced at build time.
 */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
    ? define(factory)
    : ((global = global || self), (global.PlaybookSearch = factory()));
})(this, function () {
  "use strict";

  const STYLE_ID = "__playbook-search-styles";

  // Short-lived token provider + bearer-injecting fetch with one 401 retry —
  // the gallery's _resolveToken/_authedFetch. Each bundle carries its own copy
  // (the build does not bundle shared modules).
  function makeAuthedFetch(getAccessToken) {
    let accessToken = null, // kept in memory only
      tokenPromise = null; // provider call in flight, shared by concurrent requests
    // rejectedToken is the token a request just got a 401 with: it is dropped
    // only if it is still the cached one, so requests that fail together share
    // one refresh.
    const resolveToken = (rejectedToken) => {
      if (rejectedToken && rejectedToken === accessToken) accessToken = null;
      if (accessToken) return Promise.resolve(accessToken);
      if (!tokenPromise) {
        tokenPromise = Promise.resolve(getAccessToken()).then(
          (token) => {
            tokenPromise = null;
            // Never send "Bearer undefined" or "Bearer [object Object]".
            if (typeof token !== "string" || !token) {
              throw new Error("`getAccessToken` must return a non-empty string");
            }
            accessToken = token;
            return token;
          },
          (err) => {
            tokenPromise = null;
            throw err;
          }
        );
      }
      return tokenPromise;
    };
    return async function authedFetch(url, opts = {}) {
      const send = async (rejectedToken) => {
        const token = await resolveToken(rejectedToken);
        const headers = {
          "Content-Type": "application/json",
          ...(opts.headers || {}),
          Authorization: `Bearer ${token}`,
        };
        return { token, response: await fetch(url, { ...opts, headers }) };
      };
      const first = await send();
      if (first.response.status !== 401) return first.response;
      return (await send(first.token)).response;
    };
  }

  const PlaybookSearch = {
    version: __PB_VERSION__,
    instances: {},

    init: function (config) {
      const defaultConfig = {
        containerId: "__playbook-search",
        getAccessToken: null,
        organizationSlug: "",
        boardId: "",
        perPage: 50,
        debounceMs: 250,
        minChars: 1,
        placeholder: "Search assets…",
        onResults: null, // (assets, { query, total, page, totalPages }) => void
        onQuery: null, // (query) => void — fires before each request
        onError: null, // (error) => void
      };
      const settings = { ...defaultConfig, ...config };

      if (!settings.organizationSlug) {
        console.error("Playbook Search: organizationSlug is required");
        return null;
      }
      if (typeof settings.getAccessToken !== "function") {
        console.error(
          "Playbook Search: getAccessToken is required (an async function " +
            "returning a short-lived access token)."
        );
        return null;
      }
      if (typeof settings.onResults !== "function") {
        console.error("Playbook Search: onResults(assets, meta) is required");
        return null;
      }
      const container = document.getElementById(settings.containerId);
      if (!container) {
        console.error(`Playbook Search: Container #${settings.containerId} not found`);
        return null;
      }

      if (this.instances[settings.containerId]) {
        this.instances[settings.containerId].destroy();
        delete this.instances[settings.containerId];
      }

      this._injectStyles();
      const instance = new SearchInstance(settings, container);
      this.instances[settings.containerId] = instance;
      return instance;
    },

    destroy: function (containerId) {
      if (this.instances[containerId]) {
        this.instances[containerId].destroy();
        delete this.instances[containerId];
      }
    },

    _injectStyles: function () {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      // "pb-searchbox", not "pb-search": the gallery's own search bar already
      // uses .pb-search-input and the two can share a page.
      style.textContent = `
        .pb-searchbox { font-family: inherit; }
        .pb-searchbox-input {
          width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px;
          border: 1px solid rgba(0,0,0,0.16); border-radius: 10px; background: #fff;
          color: #15171c; font: inherit; font-size: 15px; outline: none;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .pb-searchbox-input::placeholder { color: #9aa1ac; }
        .pb-searchbox-input:focus {
          border-color: #ff2753; box-shadow: 0 0 0 3px rgba(255,39,83,0.14);
        }
      `;
      document.head.appendChild(style);
    },
  };

  class SearchInstance {
    constructor(settings, container) {
      this.config = settings;
      this.container = container;
      this.apiBaseUrl = `https://api.playbook.com/v1/${settings.organizationSlug}`;
      this._authedFetch = makeAuthedFetch(settings.getAccessToken);
      this._timer = null;
      this._abort = null;
      this._boardToken = null;
      this._render();
    }

    _render() {
      this.container.classList.add("pb-searchbox");
      const input = document.createElement("input");
      input.type = "search";
      input.className = "pb-searchbox-input";
      input.placeholder = this.config.placeholder;
      input.autocomplete = "off";
      input.addEventListener("input", () => this._onInput(input.value));
      this.container.innerHTML = "";
      this.container.appendChild(input);
      this.input = input;
    }

    _onInput(value) {
      clearTimeout(this._timer);
      const q = value.trim();
      if (q.length < this.config.minChars) {
        // Drop the query in flight so it cannot land after this clear.
        if (this._abort) this._abort.abort();
        this._abort = null;
        this.config.onResults([], { query: q, total: 0, page: 1, totalPages: 1 });
        return;
      }
      this._timer = setTimeout(() => this.search(q), this.config.debounceMs);
    }

    // The search filter takes a board token and boardId may be a numeric id,
    // so look the board up once (the gallery does the same for its root board).
    _resolveBoardToken() {
      if (!this._boardToken) {
        const boardId = this.config.boardId;
        this._boardToken = this._authedFetch(
          `${this.apiBaseUrl}/boards/${encodeURIComponent(boardId)}`
        )
          .then((res) => (res.ok ? res.json() : {}))
          .then((data) => (data.data || data.board || data).token || boardId)
          .catch(() => boardId);
      }
      return this._boardToken;
    }

    async search(query, page = 1) {
      query = (query || "").trim();
      if (this.config.onQuery) this.config.onQuery(query);
      if (this._abort) this._abort.abort();
      const abort = (this._abort = new AbortController());
      try {
        const boardId =
          this.config.boardId && this.config.boardId !== "all" ? this.config.boardId : "";
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: (this.config.perPage || 50).toString(),
        });
        let url;
        if (query) {
          // Same endpoint and board scoping as the gallery's search.
          params.append("query", query);
          if (boardId) {
            params.append("filters[recursive_boards][]", await this._resolveBoardToken());
          }
          url = `${this.apiBaseUrl}/search?${params}`;
        } else {
          params.append("nested_assets", "true");
          url = boardId
            ? `${this.apiBaseUrl}/boards/${encodeURIComponent(boardId)}/assets?${params}`
            : `${this.apiBaseUrl}/assets?${params}`;
        }
        const res = await this._authedFetch(url, { signal: abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (abort.signal.aborted) return;
        const assets = (data.data || data.assets || []).filter(
          (a) => a.collection_type !== "board"
        );
        const pagy = data.pagy || {};
        this.config.onResults(assets, {
          query,
          total: pagy.total_count ?? assets.length,
          page: pagy.current_page || page,
          totalPages: pagy.total_pages || 1,
        });
      } catch (err) {
        if (err.name === "AbortError" || abort.signal.aborted) return;
        console.error("Playbook Search: query failed -", err.message || err);
        if (this.config.onError) this.config.onError(err);
      } finally {
        // Only clear our own controller: a newer search may have replaced it.
        if (this._abort === abort) this._abort = null;
      }
    }

    destroy() {
      clearTimeout(this._timer);
      if (this._abort) this._abort.abort();
      this.container.innerHTML = "";
      this.container.classList.remove("pb-searchbox");
    }
  }

  return PlaybookSearch;
});
