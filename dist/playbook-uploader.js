/*! Playbook Uploader SDK v1.1.0 | MIT License | https://github.com/playbook-labs/playbook-sdk */
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = global || self, global.PlaybookUploader = factory());
})(this, function() {
  "use strict";
  const STYLE_ID = "__playbook-uploader-styles";
  const SAFE_UPLOAD_HEADER = /^(content-type|content-md5|content-disposition|cache-control|x-goog-|x-amz-)/i;
  const PlaybookUploader = {
    version: "1.1.0",
    instances: {},
    init: function(config) {
      const defaultConfig = {
        containerId: "__playbook-uploader",
        // REQUIRED. async (file) => upload_prepare data. Call YOUR backend,
        // which calls Playbook's POST /v1/{org}/assets/upload_prepare and returns
        // its `data` (storage_provider, upload_url, signed_gcs_id,
        // encrypted_organization_metadata, file_extension, multipart_upload_id,
        // part_size, parts). The write token stays on your server.
        getUploadTarget: null,
        // Optional. async (target, file) => asset. Called after the bytes land;
        // your backend calls POST /v1/{org}/assets/upload_complete with the
        // target's signed_gcs_id (+ multipart_upload_id) and returns the asset.
        finishUpload: null,
        variant: "dropzone",
        // "dropzone" (full drag area) | "button" (compact)
        accept: "image/*,video/*",
        maxFileSizeBytes: 104857600,
        // 100 MB (the create_upload_url ceiling)
        maxFiles: 0,
        // 0 = unlimited
        concurrency: 3,
        // max uploads in flight — bounds backend/API load
        multiple: true,
        autoUpload: true,
        labels: {
          prompt: "Drag files here or click to upload",
          hint: "Images and video",
          button: "Upload files"
        },
        // Hooks
        onSelect: null,
        // (files: File[]) => void
        onProgress: null,
        // (file, pct) => void
        onFileComplete: null,
        // (asset, file) => void
        onComplete: null,
        // (assets) => void  (all succeeded/settled)
        onError: null
        // (error, file) => void
      };
      const settings = { ...defaultConfig, ...config };
      settings.labels = { ...defaultConfig.labels, ...config && config.labels };
      if (typeof settings.getUploadTarget !== "function") {
        console.error(
          "Playbook Uploader: getUploadTarget(file) is required \u2014 it must return a signed target minted by your backend (never a write token)."
        );
        return null;
      }
      const container = document.getElementById(settings.containerId);
      if (!container) {
        console.error(
          `Playbook Uploader: Container #${settings.containerId} not found`
        );
        return null;
      }
      if (this.instances[settings.containerId]) {
        this.instances[settings.containerId].destroy();
        delete this.instances[settings.containerId];
      }
      this._injectStyles();
      const instance = new UploaderInstance(settings, container);
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
        .pb-uploader { font-family: inherit; }
        .pb-uploader-dropzone {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 6px; padding: 32px 20px;
          border: 2px dashed rgba(0,0,0,0.18); border-radius: 12px;
          background: rgba(0,0,0,0.015); color: #4a4f57; cursor: pointer;
          text-align: center; transition: border-color .15s ease, background .15s ease;
        }
        .pb-uploader-dropzone:hover { border-color: rgba(0,0,0,0.3); }
        .pb-uploader-dropzone--dragover {
          border-color: #ff2753; background: rgba(255,39,83,0.05);
        }
        .pb-uploader-button {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; border: 1px solid rgba(0,0,0,0.14);
          border-radius: 10px; background: #16181c; color: #fff;
          font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .pb-uploader-button:hover { background: #000; }
        .pb-uploader-prompt { font-size: 15px; font-weight: 600; }
        .pb-uploader-hint { font-size: 12.5px; color: #8b93a1; }
        .pb-uploader-list { list-style: none; margin: 12px 0 0; padding: 0;
          display: flex; flex-direction: column; gap: 8px; }
        .pb-uploader-item {
          display: grid; grid-template-columns: 1fr auto; align-items: center;
          gap: 4px 12px; padding: 10px 12px; border-radius: 8px;
          background: rgba(0,0,0,0.03);
        }
        .pb-uploader-filename { font-size: 13px; color: #16181c;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pb-uploader-status { font-size: 12px; color: #8b93a1; justify-self: end; }
        .pb-uploader-bar { grid-column: 1 / -1; height: 4px; border-radius: 999px;
          background: rgba(0,0,0,0.08); overflow: hidden; }
        .pb-uploader-bar-fill { height: 100%; width: 0; border-radius: 999px;
          background: #ff2753; transition: width .15s ease; }
        .pb-uploader-item--error .pb-uploader-bar-fill { background: #e5484d; }
        .pb-uploader-item--error .pb-uploader-status { color: #e5484d; }
        .pb-uploader-item--done .pb-uploader-bar-fill { background: #30a46c; }
      `;
      document.head.appendChild(style);
    }
  };
  class UploaderInstance {
    constructor(settings, container) {
      this.config = settings;
      this.container = container;
      this.eventListeners = [];
      this.results = [];
      this.queue = [];
      this.active = 0;
      this.outstanding = 0;
      this._render();
    }
    _on(el, evt, fn) {
      el.addEventListener(evt, fn);
      this.eventListeners.push({ el, evt, fn });
    }
    _render() {
      this.container.classList.add("pb-uploader");
      this.container.innerHTML = "";
      const input = document.createElement("input");
      input.type = "file";
      input.accept = this.config.accept;
      input.multiple = this.config.multiple;
      input.style.display = "none";
      const list = document.createElement("ul");
      list.className = "pb-uploader-list";
      const trigger = this.config.variant === "button" ? this._renderButton() : this._renderDropzone();
      this.container.appendChild(trigger);
      this.container.appendChild(input);
      this.container.appendChild(list);
      this.trigger = trigger;
      this.input = input;
      this.list = list;
      this._on(input, "change", () => {
        this._addFiles(input.files);
        input.value = "";
      });
    }
    // Compact trigger: a button, no drag area.
    _renderButton() {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pb-uploader-button";
      btn.textContent = this.config.labels.button;
      this._on(btn, "click", () => this.input.click());
      return btn;
    }
    // Full drag-and-drop area.
    _renderDropzone() {
      const dropzone = document.createElement("div");
      dropzone.className = "pb-uploader-dropzone";
      dropzone.setAttribute("role", "button");
      dropzone.setAttribute("tabindex", "0");
      const prompt = document.createElement("div");
      prompt.className = "pb-uploader-prompt";
      prompt.textContent = this.config.labels.prompt;
      const hint = document.createElement("div");
      hint.className = "pb-uploader-hint";
      hint.textContent = this.config.labels.hint;
      dropzone.appendChild(prompt);
      dropzone.appendChild(hint);
      this._on(dropzone, "click", () => this.input.click());
      this._on(dropzone, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.input.click();
        }
      });
      ["dragenter", "dragover"].forEach(
        (evt) => this._on(dropzone, evt, (e) => {
          e.preventDefault();
          dropzone.classList.add("pb-uploader-dropzone--dragover");
        })
      );
      ["dragleave", "drop"].forEach(
        (evt) => this._on(dropzone, evt, (e) => {
          e.preventDefault();
          dropzone.classList.remove("pb-uploader-dropzone--dragover");
        })
      );
      this._on(dropzone, "drop", (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
          this._addFiles(e.dataTransfer.files);
        }
      });
      return dropzone;
    }
    _addFiles(fileList) {
      let files = Array.from(fileList || []);
      if (this.config.maxFiles > 0) {
        files = files.slice(0, this.config.maxFiles);
      }
      const accepted = files.filter((f) => this._validate(f));
      if (!accepted.length) return;
      if (typeof this.config.onSelect === "function") {
        this.config.onSelect(accepted);
      }
      accepted.forEach((file) => {
        const row = this._addRow(file);
        if (this.config.autoUpload) {
          this.queue.push({ file, row });
          this.outstanding += 1;
        }
      });
      this._pump();
    }
    // Start queued uploads up to the concurrency cap, so dropping thousands of
    // files can't fire thousands of parallel getUploadTarget + PUT requests.
    _pump() {
      while (this.active < this.config.concurrency && this.queue.length) {
        const { file, row } = this.queue.shift();
        this.active += 1;
        this._upload(file, row).then(() => {
          this.active -= 1;
          this.outstanding -= 1;
          this._pump();
          if (this.outstanding === 0 && typeof this.config.onComplete === "function") {
            this.config.onComplete(
              this.results.filter((r) => r.ok).map((r) => r.asset)
            );
          }
        });
      }
    }
    _validate(file) {
      if (file.size > this.config.maxFileSizeBytes) {
        this._fail(
          null,
          file,
          new Error(
            `${file.name} is larger than the ${this.config.maxFileSizeBytes}-byte limit`
          )
        );
        return false;
      }
      return true;
    }
    _addRow(file) {
      const item = document.createElement("li");
      item.className = "pb-uploader-item";
      const name = document.createElement("span");
      name.className = "pb-uploader-filename";
      name.textContent = file.name;
      const status = document.createElement("span");
      status.className = "pb-uploader-status";
      status.textContent = "Queued";
      const bar = document.createElement("div");
      bar.className = "pb-uploader-bar";
      const fill = document.createElement("div");
      fill.className = "pb-uploader-bar-fill";
      bar.appendChild(fill);
      item.appendChild(name);
      item.appendChild(status);
      item.appendChild(bar);
      this.list.appendChild(item);
      return { item, status, fill };
    }
    // Resolves when the file has settled (ok or failed); never rejects, so the
    // _pump() accounting runs for every outcome.
    async _upload(file, row) {
      try {
        row.status.textContent = "Preparing\u2026";
        const target = await this.config.getUploadTarget(file);
        if (!target || !target.signed_gcs_id) {
          throw new Error("getUploadTarget must return the upload_prepare data");
        }
        await this._transfer(file, target, row);
        let asset = null;
        if (typeof this.config.finishUpload === "function") {
          row.status.textContent = "Finishing\u2026";
          asset = await this.config.finishUpload(target, file);
        }
        row.item.classList.add("pb-uploader-item--done");
        row.status.textContent = "Done";
        row.fill.style.width = "100%";
        this.results.push({ file, asset, ok: true });
        if (typeof this.config.onFileComplete === "function") {
          this.config.onFileComplete(asset, file);
        }
      } catch (err) {
        this._fail(row, file, err);
      }
    }
    // Transfer the bytes to storage. The shape of this step depends on the
    // provider reported by upload_prepare:
    //   gcs        → initiate a resumable session (POST), then PUT to it
    //   backblaze  → single PUT (<5MB) or one PUT per presigned part (>=5MB)
    async _transfer(file, target, row) {
      const contentType = file.type || "application/octet-stream";
      const meta = target.encrypted_organization_metadata;
      const onPct = (pct) => this._progress(file, row, pct);
      if (target.storage_provider === "gcs") {
        if (meta == null) {
          throw new Error("upload_prepare missing encrypted_organization_metadata");
        }
        const sessionUrl = await this._gcsInitiate(file, target);
        await this._putXhr(sessionUrl, file, { "Content-Type": contentType }, onPct);
      } else if (target.multipart_upload_id && target.parts && target.parts.length) {
        if (!(target.part_size > 0)) {
          throw new Error("multipart upload_prepare returned no part_size");
        }
        await this._transferMultipart(file, target, row);
      } else if (target.storage_provider === "backblaze") {
        if (meta == null) {
          throw new Error("upload_prepare missing encrypted_organization_metadata");
        }
        await this._putXhr(
          target.upload_url,
          file,
          {
            "Content-Type": contentType,
            "x-amz-meta-extension": target.file_extension || "",
            "x-amz-meta-encrypted-organization-metadata": meta
          },
          onPct
        );
      } else {
        throw new Error(`Unsupported storage_provider: ${target.storage_provider}`);
      }
    }
    // GCS resumable: POST to start a session, read the Location header (the
    // storage bucket's CORS must expose it), and return the session URL.
    _gcsInitiate(file, target) {
      return new Promise((resolve, reject) => {
        if (!this._isHttps(target.upload_url)) {
          return reject(new Error("Upload URL must be https"));
        }
        const xhr = new XMLHttpRequest();
        xhr.open("POST", target.upload_url);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.setRequestHeader("x-goog-resumable", "start");
        xhr.setRequestHeader(
          "x-goog-meta-encrypted-organization-metadata",
          target.encrypted_organization_metadata
        );
        if (target.file_extension) {
          xhr.setRequestHeader("x-goog-meta-extension", target.file_extension);
        }
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            return reject(new Error(`GCS init failed (HTTP ${xhr.status})`));
          }
          const loc = xhr.getResponseHeader("Location");
          if (!loc) {
            return reject(
              new Error("GCS session URL missing (bucket CORS must expose Location)")
            );
          }
          resolve(loc);
        };
        xhr.onerror = () => reject(new Error("GCS init network error"));
        xhr.send(null);
      });
    }
    // Backblaze multipart: PUT each presigned part in order, aggregating
    // progress across the whole file.
    async _transferMultipart(file, target, row) {
      const total = file.size;
      let uploaded = 0;
      const parts = target.parts.slice().sort((a, b) => a.part_number - b.part_number);
      for (const part of parts) {
        const start = (part.part_number - 1) * target.part_size;
        const chunk = file.slice(start, Math.min(start + target.part_size, total));
        await this._putXhr(
          part.url,
          chunk,
          {},
          (_pct, loaded) => this._progress(file, row, Math.round((uploaded + loaded) / total * 100))
        );
        uploaded += chunk.size;
      }
      this._progress(file, row, 100);
    }
    _isHttps(url) {
      try {
        return new URL(url).protocol === "https:";
      } catch (e) {
        return false;
      }
    }
    // One PUT with upload progress (XHR, not fetch, for progress events).
    // onProgress receives (pct, loaded, total). Only storage-relevant headers
    // are sent (allowlist), never an arbitrary set from an upstream response.
    _putXhr(url, body, headers, onProgress) {
      return new Promise((resolve, reject) => {
        if (!this._isHttps(url)) return reject(new Error("Upload URL must be https"));
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        Object.keys(headers || {}).forEach((k) => {
          if (headers[k] != null && SAFE_UPLOAD_HEADER.test(k)) {
            xhr.setRequestHeader(k, headers[k]);
          }
        });
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && typeof onProgress === "function") {
            onProgress(Math.round(e.loaded / e.total * 100), e.loaded, e.total);
          }
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr) : reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        xhr.onerror = () => reject(new Error("Upload network error"));
        xhr.send(body);
      });
    }
    // Update the row UI + fire the onProgress hook.
    _progress(file, row, pct) {
      row.fill.style.width = pct + "%";
      row.status.textContent = pct + "%";
      if (typeof this.config.onProgress === "function") {
        this.config.onProgress(file, pct);
      }
    }
    _fail(row, file, err) {
      if (row) {
        row.item.classList.add("pb-uploader-item--error");
        row.status.textContent = "Failed";
      }
      if (typeof this.config.onError === "function") {
        this.config.onError(err, file);
      } else {
        console.error("Playbook Uploader:", err);
      }
    }
    destroy() {
      this.eventListeners.forEach(
        ({ el, evt, fn }) => el.removeEventListener(evt, fn)
      );
      this.eventListeners = [];
      this.container.innerHTML = "";
      this.container.classList.remove("pb-uploader");
    }
  }
  return PlaybookUploader;
});
