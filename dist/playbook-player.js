/*! Playbook Player SDK v1.0.4 | MIT License | https://github.com/playbook-labs/playbook-sdk */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = global || self, global.PlaybookPlayer = factory());
})(this, function() {
  "use strict";
  const STYLE_ID = "__playbook-player-styles";
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
  const fullUrlOf = (a) => a.display_url || a.url || a.thumbnail_url || "";
  const titleOf = (a) => a.title || a.name || "Video";
  const PlaybookPlayer = {
    version: "1.0.4",
    instances: {},
    init: function(config) {
      const defaultConfig = {
        containerId: "__playbook-player",
        assetToken: "",
        organizationSlug: "",
        getAccessToken: null,
        // Bypass the fetch: play these directly.
        src: "",
        poster: "",
        title: "",
        autoplay: false,
        muted: false,
        loop: false,
        controls: true,
        rounded: true,
        onReady: null,
        // (asset|null) => void
        onPlay: null,
        onError: null
      };
      const settings = { ...defaultConfig, ...config };
      const container = document.getElementById(settings.containerId);
      if (!container) {
        console.error(`Playbook Player: Container #${settings.containerId} not found`);
        return null;
      }
      if (!settings.src && !settings.assetToken) {
        console.error("Playbook Player: provide either `src` or `assetToken`");
        return null;
      }
      if (settings.assetToken && !settings.src) {
        if (!settings.organizationSlug) {
          console.error("Playbook Player: organizationSlug is required with assetToken");
          return null;
        }
        if (typeof settings.getAccessToken !== "function") {
          console.error("Playbook Player: getAccessToken is required with assetToken");
          return null;
        }
      }
      if (this.instances[settings.containerId]) {
        this.instances[settings.containerId].destroy();
        delete this.instances[settings.containerId];
      }
      this._injectStyles();
      const instance = new PlayerInstance(settings, container);
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
        .pb-player {
          position: relative; display: block; width: 100%; overflow: hidden;
          background: #000; line-height: 0;
        }
        .pb-player--rounded { border-radius: 12px; }
        .pb-player-video { display: block; width: 100%; height: auto; background: #000; }
        .pb-player-poster {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; cursor: pointer;
        }
        .pb-player-play {
          position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
          width: 72px; height: 72px; border: none; border-radius: 50%;
          background: rgba(0,0,0,0.55); color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: transform .15s ease, background .15s ease;
        }
        .pb-player-play:hover { background: rgba(0,0,0,0.72); transform: translate(-50%,-50%) scale(1.06); }
        .pb-player-play svg { width: 30px; height: 30px; margin-left: 3px; }
        .pb-player-loading, .pb-player-error {
          font-family: inherit; font-size: 13px; color: #c7ccd6; line-height: 1.4;
          padding: 16px; text-align: center;
        }
      `;
      document.head.appendChild(style);
    }
  };
  class PlayerInstance {
    constructor(settings, container) {
      this.config = settings;
      this.container = container;
      this.apiBaseUrl = `https://api.playbook.com/v1/${settings.organizationSlug}`;
      if (settings.assetToken && !settings.src) {
        this._authedFetch = makeAuthedFetch(settings.getAccessToken);
      }
      this.container.classList.add("pb-player");
      if (settings.rounded) this.container.classList.add("pb-player--rounded");
      this._start();
    }
    async _start() {
      if (this.config.src) {
        this._mount({ src: this.config.src, poster: this.config.poster, title: this.config.title });
        if (this.config.onReady) this.config.onReady(null);
        return;
      }
      this.container.innerHTML = '<div class="pb-player-loading">Loading\u2026</div>';
      try {
        const res = await this._authedFetch(
          `${this.apiBaseUrl}/assets/${encodeURIComponent(this.config.assetToken)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const asset = data.data || data.asset || data;
        const src = fullUrlOf(asset);
        if (!src) throw new Error("Asset has no playable URL");
        this._mount({ src, poster: asset.thumbnail_url || "", title: titleOf(asset) });
        if (this.config.onReady) this.config.onReady(asset);
      } catch (err) {
        console.error("Playbook Player: failed to load asset -", err.message || err);
        this.container.innerHTML = '<div class="pb-player-error">Could not load video.</div>';
        if (this.config.onError) this.config.onError(err);
      }
    }
    _mount(media) {
      this.container.innerHTML = "";
      const video = document.createElement("video");
      video.className = "pb-player-video";
      video.src = media.src;
      video.controls = this.config.controls;
      video.loop = this.config.loop;
      video.muted = this.config.muted;
      video.playsInline = true;
      video.preload = "metadata";
      if (media.title) video.setAttribute("title", media.title);
      this.video = video;
      this.container.appendChild(video);
      video.addEventListener("play", () => {
        if (this._overlay) this._overlay.remove();
        if (this._poster) this._poster.remove();
        if (this.config.onPlay) this.config.onPlay();
      });
      if (this.config.autoplay) {
        video.autoplay = true;
        const p = video.play();
        if (p && p.catch) p.catch(() => {
        });
        return;
      }
      if (media.poster) {
        const poster = document.createElement("img");
        poster.className = "pb-player-poster";
        poster.src = media.poster;
        poster.alt = media.title || "";
        poster.addEventListener("click", () => this.play());
        this.container.appendChild(poster);
        this._poster = poster;
      }
      const btn = document.createElement("button");
      btn.className = "pb-player-play";
      btn.setAttribute("aria-label", "Play");
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      btn.addEventListener("click", () => this.play());
      this.container.appendChild(btn);
      this._overlay = btn;
    }
    play() {
      if (this.video) {
        const p = this.video.play();
        if (p && p.catch) p.catch(() => {
        });
      }
    }
    pause() {
      if (this.video) this.video.pause();
    }
    destroy() {
      if (this.video) {
        try {
          this.video.pause();
          this.video.removeAttribute("src");
          this.video.load();
        } catch (e) {
        }
      }
      this.container.innerHTML = "";
      this.container.classList.remove("pb-player", "pb-player--rounded");
    }
  }
  return PlaybookPlayer;
});
