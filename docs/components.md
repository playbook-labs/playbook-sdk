# Picker, Player, Embed and Search

Four zero-dependency components that sit alongside the
[gallery](./getting-started.md) and the [uploader](./uploader.md). Each ships as
its own bundle and global:

| Component | Bundle | Global | npm import |
| --- | --- | --- | --- |
| Media picker | `dist/playbook-picker.min.js` | `PlaybookPicker` | `playbook-sdk/picker` |
| Inline video player | `dist/playbook-player.min.js` | `PlaybookPlayer` | `playbook-sdk/player` |
| Single asset embed | `dist/playbook-embed.min.js` | `PlaybookEmbed` | `playbook-sdk/embed` |
| Headless search | `dist/playbook-search.min.js` | `PlaybookSearch` | `playbook-sdk/search` |

A page wiring all four is in
[`examples/components-example.html`](../examples/components-example.html).

## Authentication

All four read from the Playbook API the way the gallery does: you pass
`organizationSlug` and `getAccessToken`, an async function returning a
short-lived, read-only token minted by your backend (see
[`examples/backend/token-server.mjs`](../examples/backend/token-server.mjs)).
It is called before the first request and again after a 401, and must return a
non-empty string — otherwise no request is sent.

The player and the embed need neither when you give them a direct `src`.

## Media picker

An "insert from library" modal: browse and search, select one or many assets,
get them back through `onSelect`.

```html
<button id="insert">Insert from library</button>
<script src="https://unpkg.com/playbook-sdk/dist/playbook-picker.min.js"></script>
<script>
  document.getElementById("insert").addEventListener("click", () => {
    PlaybookPicker.open({
      organizationSlug: "acme",
      getAccessToken: async () => (await fetch("/playbook/token")).json().then((r) => r.token),
      onSelect: (assets) => console.log(assets.map((a) => a.token)),
    });
  });
</script>
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `organizationSlug` | `string` | — | **Required.** |
| `getAccessToken` | `() => Promise<string>` | — | **Required.** |
| `boardId` | `string` | `""` | Limit browsing and search to one board and its sub-boards. |
| `perPage` | `number` | `30` | Assets per page; **Load more** fetches the next page. |
| `multiple` | `boolean` | `true` | `false` selects a single asset. |
| `title`, `confirmLabel`, `cancelLabel`, `searchPlaceholder`, `loadMoreLabel` | `string` | — | Modal copy. |
| `onSelect` | `(assets) => void` | — | The chosen assets, on confirm. |
| `onCancel` | `() => void` | — | Escape, the backdrop, or the close and cancel buttons. |

`PlaybookPicker.close()` dismisses it without calling either callback.

## Inline video player

A poster with a play overlay that swaps to native playback on click.

```html
<div id="player"></div>
<script src="https://unpkg.com/playbook-sdk/dist/playbook-player.min.js"></script>
<script>
  const player = PlaybookPlayer.init({
    containerId: "player",
    assetToken: "launch-video",
    organizationSlug: "acme",
    getAccessToken,
  });
  // player.play(), player.pause(), player.destroy()
</script>
```

With an `assetToken` the player plays the asset's HLS stream where the browser
supports HLS natively (Safari, iOS) and the original file everywhere else. The
original file needs download permission on the asset and is fetched through
`GET /assets/{token}/download`. No HLS library is bundled.

To skip the API, pass `src` (and optionally `poster`) instead:
`PlaybookPlayer.init({ containerId: "player", src: "clip.mp4", poster: "clip.jpg" })`.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `containerId` | `string` | `"__playbook-player"` | Element the player renders into. |
| `assetToken` | `string` | `""` | Needs `organizationSlug` and `getAccessToken`. |
| `src`, `poster`, `title` | `string` | `""` | Play a URL directly. |
| `autoplay` | `boolean` | `false` | If the browser blocks it, the play overlay is shown instead. |
| `muted`, `loop` | `boolean` | `false` | |
| `controls`, `rounded` | `boolean` | `true` | |
| `onReady` | `(asset \| null) => void` | — | The video's metadata has loaded. |
| `onPlay` | `() => void` | — | |
| `onError` | `(error) => void` | — | The asset request or the video itself failed. |

## Single asset embed

One asset, as a responsive image or video. Images open the `PlaybookViewer`
lightbox on click when its bundle is on the page.

```html
<div id="hero"></div>
<script src="https://unpkg.com/playbook-sdk/dist/playbook-viewer.min.js"></script>
<script src="https://unpkg.com/playbook-sdk/dist/playbook-embed.min.js"></script>
<script>
  PlaybookEmbed.init({
    containerId: "hero",
    assetToken: "hero-jpg",
    organizationSlug: "acme",
    getAccessToken,
  });
</script>
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `containerId` | `string` | `"__playbook-embed-asset"` | Element the embed renders into. |
| `assetToken` | `string` | `""` | Needs `organizationSlug` and `getAccessToken`. |
| `src` | `string` | `""` | Render a URL directly, with no API call. |
| `type` | `string` | `""` | `"image"`, `"video"` or a MIME type. Only for a direct `src` whose URL has no video extension to detect it by. |
| `title`, `alt` | `string` | `""` | |
| `lightbox`, `rounded` | `boolean` | `true` | |
| `onLoad` | `(asset \| null) => void` | — | The image, or the video's metadata, has loaded. |
| `onError` | `(error) => void` | — | The asset request or the media itself failed. |

Video assets resolve their source the same way the player does.

## Headless search

A search input and nothing else: matches go to your own UI through `onResults`.

```html
<div id="search"></div>
<ul id="results"></ul>
<script src="https://unpkg.com/playbook-sdk/dist/playbook-search.min.js"></script>
<script>
  const search = PlaybookSearch.init({
    containerId: "search",
    organizationSlug: "acme",
    getAccessToken,
    onResults: (assets, { query, total, page, totalPages }) => {
      // Asset titles are untrusted: set them with textContent, not innerHTML.
      const items = assets.map((a) => {
        const li = document.createElement("li");
        li.textContent = a.title;
        return li;
      });
      document.getElementById("results").replaceChildren(...items);
    },
  });
  // search.search("logo", 2) fetches a later page; search.destroy() removes it.
</script>
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `containerId` | `string` | `"__playbook-search"` | Element the input renders into. |
| `organizationSlug` | `string` | — | **Required.** |
| `getAccessToken` | `() => Promise<string>` | — | **Required.** |
| `onResults` | `(assets, meta) => void` | — | **Required.** `meta` is `{ query, total, page, totalPages }`. |
| `boardId` | `string` | `""` | Limit the search to one board and its sub-boards. |
| `perPage` | `number` | `50` | |
| `debounceMs` | `number` | `250` | |
| `minChars` | `number` | `1` | Shorter input reports no results without a request. |
| `placeholder` | `string` | `"Search assets…"` | |
| `onQuery` | `(query) => void` | — | Fires before each request. |
| `onError` | `(error) => void` | — | |

A newer query cancels the one before it, so `onResults` only ever reports the
latest. Searching uses the same endpoint as the gallery (`/search`); an empty
query lists assets instead.

## Teardown

`PlaybookPlayer.destroy(containerId)`, `PlaybookEmbed.destroy(containerId)` and
`PlaybookSearch.destroy(containerId)` (or `destroy()` on the instance) remove
the DOM and cancel any request in flight.
