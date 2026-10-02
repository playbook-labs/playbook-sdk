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
getUploadTarget(file)  ──►  assets/upload_prepare  ──►   signed target
     transfer bytes  ──────────────────────────────►    (direct to storage)
finishUpload(target)   ──►  assets/upload_complete ──►   asset
```

The transfer step is **provider-aware** — `upload_prepare` reports a
`storage_provider`, and the SDK does whichever it calls for: **GCS** (initiate a
resumable session with a POST, then PUT to it) or **Backblaze** (a single PUT, or
one PUT per presigned part for files ≥ 5 MB). You don't handle any of that; you
just supply the two backend callbacks. See
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

    // Your backend calls assets/upload_prepare and returns its `data`.
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
      return res.json(); // upload_prepare data (storage_provider, upload_url, …)
    },

    // After the transfer, your backend calls assets/upload_complete.
    finishUpload: async (target) => {
      const res = await fetch("/playbook/finish-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
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
| `getUploadTarget` | `(file) => Promise<UploadTarget>` | — | **Required.** `upload_prepare` data from your backend. |
| `finishUpload` | `(target, file) => Promise<Asset>` | — | Register the asset after the transfer. |
| `accept` | `string` | `"image/*,video/*"` | File input filter. |
| `maxFileSizeBytes` | `number` | `104857600` | Client-side cap (UX only); the API enforces real limits. |
| `maxFiles` | `number` | `0` | Per-selection cap; `0` = unlimited. |
| `concurrency` | `number` | `3` | Max uploads in flight at once. |
| `multiple` | `boolean` | `true` | Allow multi-select. |
| `autoUpload` | `boolean` | `true` | Upload on select vs. wait. |
| `labels` | `{ prompt, hint }` | — | Dropzone copy. |

### Events

`onSelect(files)`, `onProgress(file, pct)`, `onFileComplete(asset, file)`,
`onComplete(assets)`, `onError(error, file)`.

## `UploadTarget` shape

What `getUploadTarget` resolves to — the `data` from Playbook's
`assets/upload_prepare`, returned by your backend verbatim. The SDK reads it to
perform the transfer; none of it is secret (signed URLs + opaque metadata):

```ts
{
  storage_provider: "gcs" | "backblaze";
  upload_url?: string | null;              // GCS resumable-init POST, or B2 single PUT
  signed_gcs_id: string;                   // passed back to upload_complete
  encrypted_organization_metadata: string; // carried in the storage headers
  file_extension?: string | null;
  multipart_upload_id?: string | null;     // B2 multipart (>= 5 MB)
  part_size?: number | null;
  parts?: { part_number: number; url: string }[] | null;
}
```

The SDK hands this whole object back to `finishUpload`; your backend completes
with its `signed_gcs_id` (+ `multipart_upload_id`). Those ids are verified by the
Playbook API, so a forged one fails — but the **title and board must be decided
server-side** (bound at prepare, re-read at complete), never taken from the
browser's echo.

## Security checklist for your backend

The browser is token-free by design, which means **your backend is the only
gate**. Before production, the endpoints behind `getUploadTarget`/`finishUpload`
must:

- **Authenticate the caller** — the reference backend ships `requireAuth` as a
  `501` stub so an open endpoint can't be deployed by accident.
- **Lock CORS** to your own origin(s); never wildcard.
- **Rate-limit** — each prepare is a Playbook API call and a storage write.
- **Decide `title`/`collection_token` server-side**, bound at `upload_prepare`
  (keyed by `signed_gcs_id`) and re-read at `upload_complete` — never file an
  asset using values echoed back from the browser.
- **Re-validate** size (a positive integer) and MIME against an allowlist.

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
