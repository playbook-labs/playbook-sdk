/*! Playbook Embed SDK v1.1.0 | MIT License | https://github.com/playbook-labs/playbook-sdk */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = global || self, global.PlaybookEmbed = factory());
})(this, function() {
  "use strict";
  const STYLE_ID = "__playbook-embed-styles";
  function makeAuthedFetch(getAccessToken) {
    let accessToken = null, tokenPromise = null;
    const resolveToken = (rejectedToken) => {
      if (rejectedToken && rejectedToken === accessToken) accessToken = null;
      if (accessToken) return Promise.resolve(accessToken);
      if (!tokenPromise) {
        tokenPromise = Promise.resolve(getAccessToken()).then(
          (token) => {
            tokenPromise = null;
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
          ...opts.headers || {},
          Authorization: `Bearer ${token}`
        };
        return { token, response: await fetch(url, { ...opts, headers }) };
      };
      const first = await send();
      if (first.response.status !== 401) return first.response;
      return (await send(first.token)).response;
    };
  }
  const titleOf = (a) => a.title || a.name || "Asset";
  const isVideo = (type, url) => (type || "").indexOf("video") === 0 || /\.(mp4|webm|ogg|mov|m3u8)(?:[?#]|$)/i.test(url || "");
  const canPlayHls = () => document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== "";
  const PlaybookEmbed = {
    version: "1.1.0",
    instances: {},
    init: function(config) {
      const defaultConfig = {
        containerId: "__playbook-embed-asset",
        assetToken: "",
        organizationSlug: "",
        getAccessToken: null,
        // Bypass the fetch: render these directly.
        src: "",
        type: "",
        // "image" | "video" | a MIME — only needed with a direct src
        title: "",
        alt: "",
        lightbox: true,
        // images open PlaybookViewer on click when present
        rounded: true,
        onLoad: null,
        // (asset|null) => void
        onError: null
        // (error) => void
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
        .pb-embed { display: block; line-height: 0; max-width: 100%; }
        .pb-embed-media { display: block; max-width: 100%; height: auto; background: #f3f4f6; }
        /* Images render at their natural size (shrink to fit, never upscale, so
           they stay crisp); video fills the container width. */
        .pb-embed img.pb-embed-media { width: auto; }
        .pb-embed video.pb-embed-media { width: 100%; }
        .pb-embed--rounded .pb-embed-media { border-radius: 12px; }
        .pb-embed--clickable { cursor: zoom-in; }
        .pb-embed-loading, .pb-embed-error {
          font-family: inherit; font-size: 13px; color: #9aa1ac; line-height: 1.4;
          padding: 10px 0;
        }
      `;
      document.head.appendChild(style);
    }
  };
  class EmbedInstance {
    constructor(settings, container) {
      this.config = settings;
      this.container = container;
      this.apiBaseUrl = `https://api.playbook.com/v1/${settings.organizationSlug}`;
      if (settings.assetToken && !settings.src) {
        this._authedFetch = makeAuthedFetch(settings.getAccessToken);
      }
      this._abort = new AbortController();
      this._destroyed = false;
      this.container.classList.add("pb-embed");
      if (settings.rounded) this.container.classList.add("pb-embed--rounded");
      this._start();
    }
    async _start() {
      if (this.config.src) {
        this._renderMedia(
          {
            src: this.config.src,
            title: this.config.title,
            video: isVideo(this.config.type, this.config.src)
          },
          null
        );
        return;
      }
      this.container.innerHTML = '<div class="pb-embed-loading">Loading\u2026</div>';
      try {
        const path = `/assets/${encodeURIComponent(this.config.assetToken)}`;
        const asset = await this._getJson(path);
        const video = isVideo(asset.media_type || asset.type, asset.display_url || asset.url);
        let src;
        let poster = "";
        if (video) {
          src = asset.stream_url && canPlayHls() ? asset.stream_url : (await this._getJson(`${path}/download`)).raw_url;
          poster = asset.display_url || asset.thumbnail_url || "";
        } else {
          src = asset.display_url || asset.url || asset.thumbnail_url;
        }
        if (this._destroyed) return;
        if (!src) throw new Error("Asset has no displayable URL");
        this._renderMedia(
          { src, poster, title: this.config.title || titleOf(asset), video },
          asset
        );
      } catch (err) {
        this._fail(err);
      }
    }
    async _getJson(path) {
      const res = await this._authedFetch(this.apiBaseUrl + path, { signal: this._abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.data || data.asset || data;
    }
    _fail(err) {
      if (this._destroyed) return;
      console.error("Playbook Embed: failed to load asset -", err.message || err);
      this.container.innerHTML = '<div class="pb-embed-error">Could not load asset.</div>';
      if (this.config.onError) this.config.onError(err);
    }
    _renderMedia(media, asset) {
      this.container.innerHTML = "";
      let el;
      if (media.video) {
        el = document.createElement("video");
        el.controls = true;
        el.playsInline = true;
        el.preload = "metadata";
        if (media.poster) el.poster = media.poster;
      } else {
        el = document.createElement("img");
        el.alt = this.config.alt || media.title || "";
        el.loading = "lazy";
      }
      el.addEventListener(
        media.video ? "loadedmetadata" : "load",
        () => {
          if (this.config.onLoad) this.config.onLoad(asset);
        },
        { once: true }
      );
      el.addEventListener("error", () => this._fail(new Error("Media failed to load")));
      el.src = media.src;
      el.className = "pb-embed-media";
      this.container.appendChild(el);
      if (!media.video && this.config.lightbox && typeof window !== "undefined") {
        if (window.PlaybookViewer) this.container.classList.add("pb-embed--clickable");
        el.addEventListener("click", () => {
          if (window.PlaybookViewer) {
            window.PlaybookViewer.open({ src: media.src, type: "image", title: media.title });
          }
        });
      }
    }
    destroy() {
      this._destroyed = true;
      this._abort.abort();
      this.container.innerHTML = "";
      this.container.classList.remove("pb-embed", "pb-embed--rounded", "pb-embed--clickable");
    }
  }
  return PlaybookEmbed;
});
