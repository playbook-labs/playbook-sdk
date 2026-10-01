# Uploader

A zero-dependency, drag-and-drop uploader for the Playbook media library. It is
the write companion to the read-only gallery, and ships as its own bundle
(`dist/playbook-uploader.min.js`, global `PlaybookUploader`).

## The one rule: no write token in the browser

A write-scoped Playbook token in client code lets anyone who views source write
to your workspace. So the uploader never takes one. Instead you provide two
async callbacks that call **your** backend, which holds the secret token and
talks to Playbook:

```
browser                     your backend                 Playbook
───────                     ────────────                 ────────
getUploadTarget(file)  ──►  create_upload_url      ──►   signed target
     PUT bytes  ───────────────────────────────────►    (direct to storage)
finishUpload(finalize) ──►  finish_upload          ──►   asset
```

The browser only ever holds a short-lived, single-use upload target. See
[`examples/backend/upload-target.js`](../examples/backend/upload-target.js) for a
runnable reference backend, and
[`examples/uploader-example.html`](../examples/uploader-example.html) for the
client wiring.

## Quick start

```html
<div id="uploader"></div>
<script src="https://unpkg.com/playbook-sdk/dist/playbook-uploader.min.js"></script>
<script>
  PlaybookUploader.init({
    containerId: "uploader",

    // Ask YOUR backend for a signed target (it calls create_upload_url).
    getUploadTarget: async (file) => {
      const res = await fetch("/playbook/upload-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          mediaType: file.type,
        }),
      });
      return res.json(); // { uploadUrl, method, headers, finalize }
    },

    // After the bytes land, your backend calls finish_upload.
    finishUpload: async (finalize) => {
      const res = await fetch("/playbook/finish-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalize }),
      });
      return res.json(); // the created asset
    },

    onComplete: (assets) => console.log(`${assets.length} uploaded`),
  });
</script>
```

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `containerId` | `string` | `"__playbook-uploader"` | Element the uploader renders into. |
| `getUploadTarget` | `(file) => Promise<UploadTarget>` | — | **Required.** Signed target from your backend. |
| `finishUpload` | `(finalize, file) => Promise<Asset>` | — | Register the asset after upload. |
| `accept` | `string` | `"image/*,video/*"` | File input filter. |
| `maxFileSizeBytes` | `number` | `104857600` | 100 MB — the `create_upload_url` ceiling. |
| `maxFiles` | `number` | `0` | Per-selection cap; `0` = unlimited. |
| `concurrency` | `number` | `3` | Max uploads in flight at once. |
| `multiple` | `boolean` | `true` | Allow multi-select. |
| `autoUpload` | `boolean` | `true` | Upload on select vs. wait. |
| `labels` | `{ prompt, hint }` | — | Dropzone copy. |

### Events

`onSelect(files)`, `onProgress(file, pct)`, `onFileComplete(asset, file)`,
`onComplete(assets)`, `onError(error, file)`.

## `UploadTarget` shape

What `getUploadTarget` resolves to — your backend builds this from
`create_upload_url`:

```ts
{
  uploadUrl: string;              // signed, single-use
  method?: string;                // default "PUT"
  headers?: Record<string,string>;// default { "Content-Type": file.type }
  finalize?: any;                 // opaque; handed back to finishUpload
}
```

`finalize` is yours and the SDK never inspects it — but keep it **opaque**: put
only a server-issued id in it (the `signed_gcs_id`), not the `mediaType`, `size`,
`title`, or a `collection_token`. It round-trips through the browser, so anything
you place here is attacker-controlled by the time `finishUpload` returns it. The
backend must look up the values it signed by that id and ignore the client's echo
(see the reference backend's `pending` map).

## Security checklist for your backend

The browser is token-free by design, which means **your backend is the only
gate**. Before production, the endpoints behind `getUploadTarget`/`finishUpload`
must:

- **Authenticate the caller** — the reference backend ships `requireAuth` as a
  `501` stub so an open endpoint can't be deployed by accident.
- **Lock CORS** to your own origin(s); never wildcard.
- **Rate-limit** — an upload target is a Playbook API call and storage write.
- **Bind the signed values server-side** and re-read them at finish; never trust
  `mediaType`/`size`/`title`/`collection_token` from the request body.
- **Re-validate** size (as an integer ≤ 100 MB) and MIME against an allowlist.

## Showing uploads in a gallery

The uploader and the [gallery](./getting-started.md) are separate widgets, but
they pair naturally: upload on top, browse below. Keep a reference to the
gallery instance and refresh it from `onComplete` so new assets appear as soon
as they finish:

```js
const gallery = PlaybookSDK.init({
  containerId: "gallery",
  organizationSlug: "acme",
  getAccessToken: async () => (await fetch("/playbook/token")).json().then((r) => r.token),
});

PlaybookUploader.init({
  containerId: "uploader",
  getUploadTarget,
  finishUpload,
  onComplete: () => gallery.refresh(), // new uploads show up immediately
});
```

A full page wiring both widgets to one backend is in
[`examples/uploader-with-gallery.html`](../examples/uploader-with-gallery.html).

## Teardown

`PlaybookUploader.destroy("uploader")` removes the instance, its DOM, and its
listeners.
