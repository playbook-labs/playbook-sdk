/**
 * Playbook Picker SDK
 *
 * A zero-dependency "insert from library" modal for the Playbook media library.
 * Call PlaybookPicker.open({ organizationSlug, getAccessToken, onSelect }) on a
 * button click; the user browses/searches, selects one or many assets, and the
 * chosen assets (with their tokens and URLs) come back through onSelect.
 *
 * Imperative, like the viewer: open(opts) / close(). Auth mirrors the gallery —
 * getAccessToken is an async provider returning a short-lived token.
 *
 * Build with `npm run build`. `__PB_VERSION__` is replaced at build time.
 */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
    ? define(factory)
    : ((global = global || self), (global.PlaybookPicker = factory()));
})(this, function () {
  "use strict";

  const STYLE_ID = "__playbook-picker-styles";

  function makeAuthedFetch(getAccessToken) {
    let token,
      resolved = false,
      pending = null;
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
        const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
        if (t) headers["Authorization"] = "Bearer " + t;
        return fetch(url, { ...opts, headers });
      };
      const res = await send(false);
      return res.status === 401 ? send(true) : res;
    };
  }

  const thumbOf = (a) => a.thumbnail_url || a.display_url || a.url || "";
  const titleOf = (a) => a.title || a.name || "Asset";
  const keyOf = (a) => a.token || a.id;
  const escapeHtml = (s) => {
    const d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  };

  const PlaybookPicker = {
    version: __PB_VERSION__,
    _overlay: null,
    _onKey: null,

    open: function (opts) {
      opts = opts || {};
      if (!opts.organizationSlug) {
        console.error("Playbook Picker: organizationSlug is required");
        return;
      }
      if (typeof opts.getAccessToken !== "function") {
        console.error("Playbook Picker: getAccessToken is required");
        return;
      }
      this.close();

      this.config = {
        boardId: "",
        perPage: 30,
        multiple: true,
        title: "Select media",
        confirmLabel: "Select",
        cancelLabel: "Cancel",
        searchPlaceholder: "Search the library…",
        onSelect: null, // (assets) => void
        onCancel: null, // () => void
        ...opts,
      };
      this.apiBaseUrl = `https://api.playbook.com/v1/${this.config.organizationSlug}`;
      this._authedFetch = makeAuthedFetch(this.config.getAccessToken);
      this._selected = new Map(); // key -> asset
      this._assets = [];
      this._abort = null;
      this._timer = null;

      this._injectStyles();
      this._mount();
      this._fetch("");
    },

    close: function () {
      if (this._timer) clearTimeout(this._timer);
      if (this._abort) this._abort.abort();
      if (this._onKey) document.removeEventListener("keydown", this._onKey);
      if (this._overlay) this._overlay.remove();
      this._overlay = null;
    },

    _cancel: function () {
      const cb = this.config && this.config.onCancel;
      this.close();
      if (cb) cb();
    },

    _confirm: function () {
      const chosen = Array.from(this._selected.values());
      const cb = this.config && this.config.onSelect;
      this.close();
      if (cb) cb(chosen);
    },

    _mount: function () {
      const overlay = document.createElement("div");
      overlay.className = "pb-picker-overlay";
      overlay.innerHTML =
        '<div class="pb-picker-backdrop"></div>' +
        '<div class="pb-picker-dialog" role="dialog" aria-modal="true">' +
        '  <div class="pb-picker-head">' +
        '    <span class="pb-picker-title"></span>' +
        '    <button class="pb-picker-x" aria-label="Close">&times;</button>' +
        "  </div>" +
        '  <div class="pb-picker-tools">' +
        '    <input class="pb-picker-search" type="search" autocomplete="off">' +
        "  </div>" +
        '  <div class="pb-picker-grid"></div>' +
        '  <div class="pb-picker-foot">' +
        '    <span class="pb-picker-count"></span>' +
        '    <span class="pb-picker-actions">' +
        '      <button class="pb-picker-btn pb-picker-cancel"></button>' +
        '      <button class="pb-picker-btn pb-picker-confirm" disabled></button>' +
        "    </span>" +
        "  </div>" +
        "</div>";

      overlay.querySelector(".pb-picker-title").textContent = this.config.title;
      const search = overlay.querySelector(".pb-picker-search");
      search.placeholder = this.config.searchPlaceholder;
      overlay.querySelector(".pb-picker-cancel").textContent = this.config.cancelLabel;

      overlay.querySelector(".pb-picker-backdrop").addEventListener("click", () => this._cancel());
      overlay.querySelector(".pb-picker-x").addEventListener("click", () => this._cancel());
      overlay.querySelector(".pb-picker-cancel").addEventListener("click", () => this._cancel());
      overlay.querySelector(".pb-picker-confirm").addEventListener("click", () => this._confirm());
      search.addEventListener("input", () => {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._fetch(search.value.trim()), 250);
      });

      this._onKey = (e) => {
        if (e.key === "Escape") this._cancel();
      };
      document.addEventListener("keydown", this._onKey);

      document.body.appendChild(overlay);
      this._overlay = overlay;
      this._updateFooter();
    },

    async _fetch(query) {
      if (!this._overlay) return;
      const grid = this._overlay.querySelector(".pb-picker-grid");
      grid.innerHTML = '<div class="pb-picker-note">Loading…</div>';
      if (this._abort) this._abort.abort();
      this._abort = new AbortController();
      try {
        const params = new URLSearchParams({
          nested_assets: "true",
          page: "1",
          per_page: this.config.perPage.toString(),
        });
        if (query) params.append("query", query);
        const url =
          this.config.boardId && this.config.boardId !== "all"
            ? `${this.apiBaseUrl}/boards/${this.config.boardId}/assets?${params}`
            : `${this.apiBaseUrl}/assets?${params}`;
        const res = await this._authedFetch(url, { signal: this._abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this._assets = (data.data || data.assets || []).filter(
          (a) => a.collection_type !== "board"
        );
        this._renderGrid();
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Playbook Picker: failed to load assets -", err.message || err);
        grid.innerHTML = '<div class="pb-picker-note">Could not load assets.</div>';
      } finally {
        this._abort = null;
      }
    },

    _renderGrid: function () {
      const grid = this._overlay.querySelector(".pb-picker-grid");
      if (!this._assets.length) {
        grid.innerHTML = '<div class="pb-picker-note">No assets found.</div>';
        return;
      }
      grid.innerHTML = this._assets
        .map((a, i) => {
          const sel = this._selected.has(keyOf(a)) ? " pb-picker-cell--on" : "";
          const thumb = thumbOf(a);
          const img = thumb
            ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(titleOf(a))}" loading="lazy">`
            : `<span class="pb-picker-noimg">${escapeHtml(titleOf(a))}</span>`;
          return (
            `<button class="pb-picker-cell${sel}" data-i="${i}" title="${escapeHtml(titleOf(a))}">` +
            img +
            '<span class="pb-picker-check" aria-hidden="true">&#10003;</span>' +
            "</button>"
          );
        })
        .join("");
      grid.querySelectorAll(".pb-picker-cell").forEach((cell) => {
        cell.addEventListener("click", () => this._toggle(Number(cell.dataset.i), cell));
      });
    },

    _toggle: function (i, cell) {
      const asset = this._assets[i];
      if (!asset) return;
      const key = keyOf(asset);
      if (!this.config.multiple) {
        this._selected.clear();
        if (this._overlay) {
          this._overlay
            .querySelectorAll(".pb-picker-cell--on")
            .forEach((c) => c.classList.remove("pb-picker-cell--on"));
        }
        this._selected.set(key, asset);
        cell.classList.add("pb-picker-cell--on");
      } else if (this._selected.has(key)) {
        this._selected.delete(key);
        cell.classList.remove("pb-picker-cell--on");
      } else {
        this._selected.set(key, asset);
        cell.classList.add("pb-picker-cell--on");
      }
      this._updateFooter();
    },

    _updateFooter: function () {
      if (!this._overlay) return;
      const n = this._selected.size;
      const count = this._overlay.querySelector(".pb-picker-count");
      const confirm = this._overlay.querySelector(".pb-picker-confirm");
      count.textContent = n ? `${n} selected` : "";
      confirm.textContent = n > 1 ? `${this.config.confirmLabel} (${n})` : this.config.confirmLabel;
      confirm.disabled = n === 0;
    },

    _injectStyles: function () {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .pb-picker-overlay {
          position: fixed; inset: 0; z-index: 9999; display: flex;
          align-items: center; justify-content: center; font-family: inherit;
        }
        .pb-picker-backdrop { position: absolute; inset: 0; background: rgba(10,12,15,0.55); backdrop-filter: blur(2px); }
        .pb-picker-dialog {
          position: relative; display: flex; flex-direction: column;
          width: min(860px, 94vw); height: min(640px, 90vh);
          background: #fff; color: #15171c; border-radius: 16px; overflow: hidden;
          box-shadow: 0 32px 80px -24px rgba(0,0,0,0.5);
        }
        .pb-picker-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid rgba(0,0,0,0.08);
        }
        .pb-picker-title { font-size: 16px; font-weight: 650; }
        .pb-picker-x {
          border: none; background: transparent; font-size: 24px; line-height: 1;
          color: #6b7280; cursor: pointer; width: 32px; height: 32px; border-radius: 8px;
        }
        .pb-picker-x:hover { background: rgba(0,0,0,0.05); color: #15171c; }
        .pb-picker-tools { padding: 14px 18px 4px; }
        .pb-picker-search {
          width: 100%; box-sizing: border-box; height: 40px; padding: 0 14px;
          border: 1px solid rgba(0,0,0,0.16); border-radius: 10px; background: #fff;
          font: inherit; font-size: 14px; outline: none;
        }
        .pb-picker-search:focus { border-color: #ff2753; box-shadow: 0 0 0 3px rgba(255,39,83,0.14); }
        .pb-picker-grid {
          flex: 1; overflow-y: auto; padding: 14px 18px;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px; align-content: start;
        }
        .pb-picker-cell {
          position: relative; padding: 0; border: 2px solid transparent;
          border-radius: 12px; overflow: hidden; cursor: pointer; background: #f3f4f6;
          aspect-ratio: 1 / 1; line-height: 0;
        }
        .pb-picker-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .pb-picker-noimg {
          display: flex; align-items: center; justify-content: center; width: 100%;
          height: 100%; font-size: 12px; color: #9aa1ac; padding: 8px; text-align: center;
          line-height: 1.3;
        }
        .pb-picker-cell--on { border-color: #ff2753; }
        .pb-picker-check {
          position: absolute; top: 8px; right: 8px; width: 24px; height: 24px;
          border-radius: 50%; background: #ff2753; color: #fff; font-size: 14px;
          display: none; align-items: center; justify-content: center; line-height: 1;
        }
        .pb-picker-cell--on .pb-picker-check { display: flex; }
        .pb-picker-note { grid-column: 1 / -1; color: #9aa1ac; font-size: 14px; padding: 24px 0; text-align: center; }
        .pb-picker-foot {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; border-top: 1px solid rgba(0,0,0,0.08);
        }
        .pb-picker-count { font-size: 13px; color: #6b7280; }
        .pb-picker-actions { display: inline-flex; gap: 10px; }
        .pb-picker-btn {
          height: 38px; padding: 0 16px; border-radius: 10px; font: inherit;
          font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid rgba(0,0,0,0.14);
          background: #fff; color: #15171c;
        }
        .pb-picker-cancel:hover { background: rgba(0,0,0,0.04); }
        .pb-picker-confirm { background: #ff2753; border-color: #ff2753; color: #fff; }
        .pb-picker-confirm:disabled { opacity: 0.45; cursor: not-allowed; }
        html[data-theme="dark"] .pb-picker-dialog { background: #15171c; color: #e6e8ec; }
        html[data-theme="dark"] .pb-picker-head, html[data-theme="dark"] .pb-picker-foot { border-color: rgba(255,255,255,0.1); }
        html[data-theme="dark"] .pb-picker-search { background: #0f1115; border-color: rgba(255,255,255,0.14); color: #e6e8ec; }
        html[data-theme="dark"] .pb-picker-btn { background: #0f1115; border-color: rgba(255,255,255,0.14); color: #e6e8ec; }
        html[data-theme="dark"] .pb-picker-confirm { background: #ff2753; border-color: #ff2753; color: #fff; }
      `;
      document.head.appendChild(style);
    },
  };

  return PlaybookPicker;
});
