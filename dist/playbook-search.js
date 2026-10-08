/*! Playbook Search SDK v1.1.0 | MIT License | https://github.com/playbook-labs/playbook-sdk */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = global || self, global.PlaybookSearch = factory());
})(this, function() {
  "use strict";
  const STYLE_ID = "__playbook-search-styles";
  function makeAuthedFetch(getAccessToken) {
    let token, resolved = false, pending = null;
    const resolve = (force) => {
      if (force) resolved = false;
      if (resolved) return Promise.resolve(token);
      if (!pending) {
        pending = Promise.resolve(
          typeof getAccessToken === "function" ? getAccessToken() : null
        ).then(
          (t) => {
            token = t;
            resolved = true;
            pending = null;
            return t;
          },
          (e) => {
            pending = null;
            throw e;
          }
        );
      }
      return pending;
    };
    return async function authedFetch(url, opts = {}) {
      const send = async (force) => {
        const t = await resolve(force);
        const headers = { "Content-Type": "application/json", ...opts.headers || {} };
        if (t) headers["Authorization"] = "Bearer " + t;
        return fetch(url, { ...opts, headers });
      };
      const res = await send(false);
      return res.status === 401 ? send(true) : res;
    };
  }
  const PlaybookSearch = {
    version: "1.1.0",
    instances: {},
    init: function(config) {
      const defaultConfig = {
        containerId: "__playbook-search",
        getAccessToken: null,
        organizationSlug: "",
        boardId: "",
        perPage: 50,
        debounceMs: 250,
        minChars: 1,
        placeholder: "Search assets\u2026",
        onResults: null,
        // (assets, { query, total }) => void
        onQuery: null,
        // (query) => void — fires before each request
        onError: null
        // (error) => void
      };
      const settings = { ...defaultConfig, ...config };
      if (!settings.organizationSlug) {
        console.error("Playbook Search: organizationSlug is required");
        return null;
      }
      if (typeof settings.getAccessToken !== "function") {
        console.error(
          "Playbook Search: getAccessToken is required (an async function returning a short-lived access token)."
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
    destroy: function(containerId) {
      if (this.instances[containerId]) {
        this.instances[containerId].destroy();
        delete this.instances[containerId];
      }
    },
    _injectStyles: function() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .pb-search { font-family: inherit; }
        .pb-search-input {
          width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px;
          border: 1px solid rgba(0,0,0,0.16); border-radius: 10px; background: #fff;
          color: #15171c; font: inherit; font-size: 15px; outline: none;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .pb-search-input::placeholder { color: #9aa1ac; }
        .pb-search-input:focus {
          border-color: #ff2753; box-shadow: 0 0 0 3px rgba(255,39,83,0.14);
        }
      `;
      document.head.appendChild(style);
    }
  };
  class SearchInstance {
    constructor(settings, container) {
      this.config = settings;
      this.container = container;
      this.apiBaseUrl = `https://api.playbook.com/v1/${settings.organizationSlug}`;
      this._authedFetch = makeAuthedFetch(settings.getAccessToken);
      this._timer = null;
      this._abort = null;
      this._render();
    }
    _render() {
      this.container.classList.add("pb-search");
      const input = document.createElement("input");
      input.type = "search";
      input.className = "pb-search-input";
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
        this.config.onResults([], { query: q, total: 0 });
        return;
      }
      this._timer = setTimeout(() => this.search(q), this.config.debounceMs);
    }
    async search(query) {
      query = (query || "").trim();
      if (this.config.onQuery) this.config.onQuery(query);
      if (this._abort) this._abort.abort();
      this._abort = new AbortController();
      try {
        const params = new URLSearchParams({
          nested_assets: "true",
          page: "1",
          per_page: this.config.perPage.toString()
        });
        if (query) params.append("query", query);
        const url = this.config.boardId && this.config.boardId !== "all" ? `${this.apiBaseUrl}/boards/${encodeURIComponent(this.config.boardId)}/assets?${params}` : `${this.apiBaseUrl}/assets?${params}`;
        const res = await this._authedFetch(url, { signal: this._abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const assets = (data.data || data.assets || []).filter(
          (a) => a.collection_type !== "board"
        );
        const total = data.pagy && data.pagy.count || assets.length;
        this.config.onResults(assets, { query, total });
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Playbook Search: query failed -", err.message || err);
        if (this.config.onError) this.config.onError(err);
      } finally {
        this._abort = null;
      }
    }
    destroy() {
      clearTimeout(this._timer);
      if (this._abort) this._abort.abort();
      this.container.innerHTML = "";
      this.container.classList.remove("pb-search");
    }
  }
  return PlaybookSearch;
});
