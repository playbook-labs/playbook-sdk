/**
 * Playbook Embed SDK
 *
 * A zero-dependency embed for a single Playbook asset. Give it an assetToken
 * (it fetches the asset) or a direct src, and it renders a responsive image or
 * video. Optionally opens the standalone PlaybookViewer lightbox on click.
 *
 * PlaybookEmbed.init({ containerId, assetToken, organizationSlug,
 * getAccessToken }) returns an instance with destroy(). With a direct `src`
 * no token/auth is needed.
 *
 * Build with `npm run build`. `__PB_VERSION__` is replaced at build time.
 */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
    ? define(factory)
    : ((global = global || self), (global.PlaybookEmbed = factory()));
})(this, function () {
  "use strict";

  const STYLE_ID = "__playbook-embed-styles";

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

  const fullUrlOf = (a) => a.display_url || a.url || a.thumbnail_url || "";
  const titleOf = (a) => a.title || a.name || "Asset";
  const isVideoAsset = (a) => {
    const mt = a.media_type || a.type || "";
    return (
      mt.indexOf("video") === 0 || mt === "video" || /\.(mp4|webm|ogg|mov|m3u8)$/i.test(fullUrlOf(a))
    );
  };
  const escapeHtml = (s) => {
    const d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  };

  const PlaybookEmbed = {
    version: __PB_VERSION__,
    instances: {},

    init: function (config) {
      const defaultConfig = {
        containerId: "__playbook-embed-asset",
        assetToken: "",
        organizationSlug: "",
        getAccessToken: null,
        // Bypass the fetch: render these directly.
        src: "",
        type: "", // "image" | "video" | a MIME — only needed with a direct src
        title: "",
        alt: "",
        lightbox: true, // images open PlaybookViewer on click when present
        rounded: true,
        onLoad: null, // (asset|null) => void
        onError: null, // (error) => void
      };
      const settings = { ...defaultConfig, ...config };

      const container = document.getElementById(settings.containerId);
      if (!container) {
        console.error(`Playbook Embed: Container #${settings.containerId} not found`);
        return null;
      }
      if (!settings.src && !settings.assetToken) {
        console.error("Playbook Embed: provide either `src` or `assetToken`");
        return null;
      }
      if (settings.assetToken && !settings.src) {
        if (!settings.organizationSlug) {
          console.error("Playbook Embed: organizationSlug is required with assetToken");
          return null;
        }
        if (typeof settings.getAccessToken !== "function") {
          console.error("Playbook Embed: getAccessToken is required with assetToken");
          return null;
        }
      }

      if (this.instances[settings.containerId]) {
        this.instances[settings.containerId].destroy();
        delete this.instances[settings.containerId];
      }

      this._injectStyles();
      const instance = new EmbedInstance(settings, container);
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
      style.textContent = `
        .pb-embed { display: block; line-height: 0; max-width: 100%; }
        .pb-embed-media {
          display: block; width: 100%; height: auto; max-width: 100%;
          background: #f3f4f6;
        }
        .pb-embed--rounded .pb-embed-media { border-radius: 12px; }
        .pb-embed--clickable { cursor: zoom-in; }
        .pb-embed-loading, .pb-embed-error {
          font-family: inherit; font-size: 13px; color: #9aa1ac; line-height: 1.4;
          padding: 10px 0;
        }
      `;
      document.head.appendChild(style);
    },
  };

  class EmbedInstance {
    constructor(settings, container) {
      this.config = settings;
      this.container = container;
      this.apiBaseUrl = `https://api.playbook.com/v1/${settings.organizationSlug}`;
      if (settings.assetToken && !settings.src) {
        this._authedFetch = makeAuthedFetch(settings.getAccessToken);
      }
      this.container.classList.add("pb-embed");
      if (settings.rounded) this.container.classList.add("pb-embed--rounded");
      this._start();
    }

    async _start() {
      if (this.config.src) {
        this._renderMedia({
          src: this.config.src,
          title: this.config.title,
          media_type: this.config.type,
        });
        if (this.config.onLoad) this.config.onLoad(null);
        return;
      }
      this.container.innerHTML = '<div class="pb-embed-loading">Loading…</div>';
      try {
        const res = await this._authedFetch(
          `${this.apiBaseUrl}/assets/${encodeURIComponent(this.config.assetToken)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const asset = data.data || data.asset || data;
        if (!asset || !fullUrlOf(asset)) throw new Error("Asset has no displayable URL");
        this._renderMedia(asset);
        if (this.config.onLoad) this.config.onLoad(asset);
      } catch (err) {
        console.error("Playbook Embed: failed to load asset -", err.message || err);
        this.container.innerHTML = '<div class="pb-embed-error">Could not load asset.</div>';
        if (this.config.onError) this.config.onError(err);
      }
    }

    _renderMedia(asset) {
      const src = fullUrlOf(asset) || asset.src;
      const title = this.config.title || titleOf(asset);
      const video = isVideoAsset(asset);
      this.container.innerHTML = "";

      let el;
      if (video) {
        el = document.createElement("video");
        el.controls = true;
        el.playsInline = true;
        el.preload = "metadata";
        if (asset.thumbnail_url) el.poster = asset.thumbnail_url;
      } else {
        el = document.createElement("img");
        el.alt = this.config.alt || title;
        el.loading = "lazy";
      }
      el.src = src;
      el.className = "pb-embed-media";
      this.container.appendChild(el);

      // Images can open the lightbox; video has its own controls.
      if (!video && this.config.lightbox && typeof window !== "undefined" && window.PlaybookViewer) {
        this.container.classList.add("pb-embed--clickable");
        this._onClick = () =>
          window.PlaybookViewer.open({ src: src, type: "image", title: title });
        el.addEventListener("click", this._onClick);
      }
    }

    destroy() {
      this.container.innerHTML = "";
      this.container.classList.remove("pb-embed", "pb-embed--rounded", "pb-embed--clickable");
    }
  }

  return PlaybookEmbed;
});
