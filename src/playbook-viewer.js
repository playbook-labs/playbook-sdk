/**
 * Playbook Viewer SDK
 *
 * A zero-dependency lightbox for images and video. Imperative: call
 * PlaybookViewer.open({ src, type, title }) to show one asset, or
 * open({ items: [...], index }) for a navigable set. Escape / backdrop / the
 * close button dismiss it; arrow keys move through a set.
 *
 * Build with `npm run build`. `__PB_VERSION__` is replaced at build time.
 */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
    ? define(factory)
    : ((global = global || self), (global.PlaybookViewer = factory()));
})(this, function () {
  "use strict";

  const STYLE_ID = "__playbook-viewer-styles";

  const PlaybookViewer = {
    version: __PB_VERSION__,
    _overlay: null,
    _items: [],
    _index: 0,
    _onKey: null,

    open: function (opts) {
      opts = opts || {};
      this._items =
        opts.items && opts.items.length
          ? opts.items
          : [{ src: opts.src, type: opts.type, title: opts.title }];
      this._index = Math.min(Math.max(opts.index || 0, 0), this._items.length - 1);
      if (!this._items[0] || !this._items[0].src) {
        console.error("Playbook Viewer: open() needs a src (or items with src)");
        return;
      }
      this._injectStyles();
      if (!this._overlay) this._mount();
      this._render();
    },

    close: function () {
      if (!this._overlay) return;
      document.removeEventListener("keydown", this._onKey);
      this._overlay.remove();
      this._overlay = null;
    },

    next: function () {
      if (this._index < this._items.length - 1) {
        this._index += 1;
        this._render();
      }
    },

    prev: function () {
      if (this._index > 0) {
        this._index -= 1;
        this._render();
      }
    },

    _mount: function () {
      const overlay = document.createElement("div");
      overlay.className = "pb-viewer-overlay";
      overlay.innerHTML =
        '<div class="pb-viewer-backdrop"></div>' +
        '<button class="pb-viewer-close" aria-label="Close">&times;</button>' +
        '<button class="pb-viewer-nav pb-viewer-prev" aria-label="Previous">&#8249;</button>' +
        '<figure class="pb-viewer-figure"><div class="pb-viewer-media"></div>' +
        '<figcaption class="pb-viewer-caption"></figcaption></figure>' +
        '<button class="pb-viewer-nav pb-viewer-next" aria-label="Next">&#8250;</button>';

      overlay.querySelector(".pb-viewer-backdrop").addEventListener("click", () => this.close());
      overlay.querySelector(".pb-viewer-close").addEventListener("click", () => this.close());
      overlay.querySelector(".pb-viewer-prev").addEventListener("click", () => this.prev());
      overlay.querySelector(".pb-viewer-next").addEventListener("click", () => this.next());

      this._onKey = (e) => {
        if (e.key === "Escape") this.close();
        else if (e.key === "ArrowRight") this.next();
        else if (e.key === "ArrowLeft") this.prev();
      };
      document.addEventListener("keydown", this._onKey);

      document.body.appendChild(overlay);
      this._overlay = overlay;
    },

    // Swap in the current item; text via textContent (titles are untrusted).
    _render: function () {
      const item = this._items[this._index];
      const media = this._overlay.querySelector(".pb-viewer-media");
      const caption = this._overlay.querySelector(".pb-viewer-caption");
      const multiple = this._items.length > 1;

      media.innerHTML = "";
      let el;
      if (String(item.type || "").indexOf("video") === 0) {
        el = document.createElement("video");
        el.controls = true;
        el.autoplay = true;
      } else {
        el = document.createElement("img");
      }
      el.src = item.src;
      el.className = "pb-viewer-asset";
      media.appendChild(el);

      caption.textContent = item.title || "";
      caption.style.display = item.title ? "" : "none";

      this._overlay.querySelector(".pb-viewer-prev").style.display =
        multiple && this._index > 0 ? "" : "none";
      this._overlay.querySelector(".pb-viewer-next").style.display =
        multiple && this._index < this._items.length - 1 ? "" : "none";
    },

    _injectStyles: function () {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .pb-viewer-overlay {
          position: fixed; inset: 0; z-index: 9999; display: flex;
          align-items: center; justify-content: center;
        }
        .pb-viewer-backdrop {
          position: absolute; inset: 0; background: rgba(10,12,15,0.82);
          backdrop-filter: blur(2px);
        }
        .pb-viewer-figure {
          position: relative; margin: 0; max-width: 88vw; max-height: 88vh;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .pb-viewer-asset {
          max-width: 88vw; max-height: 82vh; border-radius: 12px;
          box-shadow: 0 24px 60px -20px rgba(0,0,0,0.7); object-fit: contain;
          background: #000;
        }
        .pb-viewer-caption {
          position: relative; color: #e6edf3; font-size: 14px; text-align: center;
        }
        .pb-viewer-close {
          position: absolute; top: 20px; right: 24px; width: 40px; height: 40px;
          border: none; border-radius: 50%; background: rgba(255,255,255,0.1);
          color: #fff; font-size: 24px; line-height: 1; cursor: pointer;
        }
        .pb-viewer-close:hover { background: rgba(255,255,255,0.2); }
        .pb-viewer-nav {
          position: relative; z-index: 1; width: 48px; height: 48px; margin: 0 8px;
          border: none; border-radius: 50%; background: rgba(255,255,255,0.1);
          color: #fff; font-size: 26px; line-height: 1; cursor: pointer; flex: none;
        }
        .pb-viewer-nav:hover { background: rgba(255,255,255,0.2); }
      `;
      document.head.appendChild(style);
    },
  };

  return PlaybookViewer;
});
