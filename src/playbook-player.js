/**
 * Playbook Player SDK
 *
 * A zero-dependency inline video player for the Playbook media library. Give it
 * an assetToken (it fetches the asset's video + poster) or a direct src, and it
 * renders a poster with a play overlay that swaps to native playback on click.
 *
 * Native playback only (no bundled HLS lib): .mp4/.webm play everywhere; .m3u8
 * (HLS) plays where the browser supports it natively (Safari/iOS). For a direct
 * src you can point at your own progressive or HLS URL.
 *
 * PlaybookPlayer.init({ containerId, assetToken, organizationSlug,
 * getAccessToken }) or ({ containerId, src, poster }) returns an instance with
 * play(), pause(), and destroy().
 *
 * Build with `npm run build`. `__PB_VERSION__` is replaced at build time.
 */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
    ? define(factory)
    : ((global = global || self), (global.PlaybookPlayer = factory()));
})(this, function () {
  "use strict";

  const STYLE_ID = "__playbook-player-styles";

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

  const titleOf = (a) => a.title || a.name || "Video";
  const canPlayHls = () =>
    document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== "";

  const PlaybookPlayer = {
    version: __PB_VERSION__,
    instances: {},

    init: function (config) {
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
        onReady: null, // (asset|null) => void
        onPlay: null,
        onError: null,
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
    },
  };

  class PlayerInstance {
    constructor(settings, container) {
      this.config = settings;
      this.container = container;
      this.apiBaseUrl = `https://api.playbook.com/v1/${settings.organizationSlug}`;
      if (settings.assetToken && !settings.src) {
        this._authedFetch = makeAuthedFetch(settings.getAccessToken);
      }
      this._abort = new AbortController();
      this._destroyed = false;
      this.container.classList.add("pb-player");
      if (settings.rounded) this.container.classList.add("pb-player--rounded");
      this._start();
    }

    async _start() {
      if (this.config.src) {
        this._mount(
          { src: this.config.src, poster: this.config.poster, title: this.config.title },
          null
        );
        return;
      }
      this.container.innerHTML = '<div class="pb-player-loading">Loading…</div>';
      try {
        const path = `/assets/${encodeURIComponent(this.config.assetToken)}`;
        const asset = await this._getJson(path);
        // For a video the API's display_url is the poster, not the video. The
        // playable sources are stream_url (HLS, null until the encode finishes)
        // and the original file's raw_url.
        const src =
          asset.stream_url && canPlayHls()
            ? asset.stream_url
            : (await this._getJson(`${path}/download`)).raw_url;
        if (this._destroyed) return;
        if (!src) throw new Error("Asset has no playable URL");
        this._mount(
          { src: src, poster: asset.display_url || asset.thumbnail_url || "", title: titleOf(asset) },
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
      console.error("Playbook Player: failed to load video -", err.message || err);
      this.video = null;
      this.container.innerHTML = '<div class="pb-player-error">Could not load video.</div>';
      if (this.config.onError) this.config.onError(err);
    }

    _mount(media, asset) {
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
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (this.config.onReady) this.config.onReady(asset);
        },
        { once: true }
      );
      video.addEventListener("error", () => {
        if (this.video === video) this._fail(new Error("Video failed to load"));
      });

      if (this.config.autoplay) {
        video.autoplay = true;
        const p = video.play();
        // Autoplay can be blocked (e.g. unmuted): fall back to the play
        // overlay so the player is never left with no way to start.
        if (p && p.catch) {
          p.catch(() => {
            if (!this._destroyed && this.video === video && video.paused) this._addOverlay(media);
          });
        }
        return;
      }
      this._addOverlay(media);
    }

    // Poster + play overlay until first play (keeps it quiet on load).
    _addOverlay(media) {
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
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      btn.addEventListener("click", () => this.play());
      this.container.appendChild(btn);
      this._overlay = btn;
    }

    play() {
      if (this.video) {
        const p = this.video.play();
        if (p && p.catch) p.catch(() => {});
      }
    }

    pause() {
      if (this.video) this.video.pause();
    }

    destroy() {
      this._destroyed = true;
      this._abort.abort();
      if (this.video) {
        try {
          this.video.pause();
          this.video.removeAttribute("src");
          this.video.load();
        } catch (e) {
          /* ignore */
        }
      }
      this.container.innerHTML = "";
      this.container.classList.remove("pb-player", "pb-player--rounded");
    }
  }

  return PlaybookPlayer;
});
