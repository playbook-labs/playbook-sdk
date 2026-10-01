# Getting Started with Playbook Gallery SDK

This guide will help you integrate Playbook Gallery SDK into your project in under 5 minutes.

## What You'll Build

A beautiful, responsive masonry grid gallery with:

- Search functionality
- Board/category navigation
- Full-screen modal viewer
- Keyboard navigation
- Download capability

## Prerequisites

- Basic HTML, CSS, and JavaScript knowledge
- A Playbook workspace, and an endpoint on your own server that hands the gallery an access token (see [Set Up Authentication](../README.md#1-set-up-authentication)), or use the mock below for testing
- A modern web browser

## Step 1: Include the SDK

### Option A: CDN (Fastest)

Add this to your HTML file:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Gallery</title>

    <!-- Optional: Tailwind CSS for styling -->
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <!-- Your gallery will go here -->
    <div id="gallery"></div>

    <!-- Include the SDK -->
    <script src="https://unpkg.com/playbook-sdk@latest/dist/playbook-sdk.min.js"></script>
  </body>
</html>
```

### Option B: npm

```bash
npm install playbook-sdk
```

```javascript
import PlaybookSDK from "playbook-sdk";
```

### Option C: Download

Download `playbook-sdk.min.js` and include it:

```html
<script src="path/to/playbook-sdk.min.js"></script>
```

## Step 2: Create a Container

Add a div where your gallery will render:

```html
<div id="my-gallery"></div>
```

You can style this container however you want. The SDK will fill it with content.

## Step 3: Initialize the SDK

Add this JavaScript code:

```javascript
const gallery = PlaybookSDK.init({
  containerId: "my-gallery",
  organizationSlug: "your-org-slug",
  getAccessToken: () => fetch("/playbook/token").then((r) => r.json()).then((r) => r.token),
});
```

`getAccessToken` fetches a short-lived, read-only token from your own server, so your API token never reaches the browser. [Set Up Authentication](../README.md#1-set-up-authentication) shows the server side.

Done. Your gallery is now live.

## Step 4: API Format

The SDK works with Playbook API which provides two main endpoints:

### GET `/v1/{org-slug}/boards` - Returns board list

```json
{
  "data": [
    {
      "token": "brand-assets",
      "title": "Brand Assets",
      "description": "Logos and brand materials"
    }
  ]
}
```

### GET `/v1/{org-slug}/assets` - Returns asset list

Supports query parameters:

- `query` - Search term
- `nested_assets` - Include assets from nested boards
- `page` - Page number
- `per_page` - Items per page

```json
{
  "data": [
    {
      "token": "asset-123",
      "title": "Company Logo",
      "display_url": "https://cdn.playbook.com/logo.png",
      "media_type": "image"
    }
  ],
  "pagy": {
    "current_page": 1,
    "total_pages": 5
  }
}
```

## Complete Example

Here's a full working example:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Asset Gallery</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
      }
    </style>
  </head>
  <body class="bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <!-- Header -->
      <header class="mb-8">
        <h1 class="text-4xl font-bold text-gray-900">Asset Library</h1>
        <p class="text-gray-600 mt-2">Browse and search our collection</p>
      </header>

      <!-- Gallery Container -->
      <div id="gallery"></div>
    </div>

    <!-- Include SDK -->
    <script src="https://unpkg.com/playbook-sdk@latest/dist/playbook-sdk.min.js"></script>

    <script>
      // Initialize the gallery
      const gallery = PlaybookSDK.init({
        containerId: "gallery",
        organizationSlug: "your-org-slug",
        getAccessToken: () => fetch("/playbook/token").then((r) => r.json()).then((r) => r.token),

        // Optional: Add callbacks
        onAssetClick: function (asset) {
          console.log("Clicked:", asset.title);
        },

        onSearch: function (query) {
          console.log("Searching for:", query);
        },
      });
    </script>
  </body>
</html>
```

## Testing Without a Backend

Don't have a backend yet? No problem! Here's how to test with mock data:

```javascript
// Override fetch for testing
const originalFetch = window.fetch;
window.fetch = function (url) {
  if (url.includes("/boards")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { token: "all", title: "All Assets" },
            { token: "photos", title: "Photos" },
          ],
        }),
    });
  }

  if (url.includes("/assets")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              token: "1",
              title: "Sample Image 1",
              display_url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
              media_type: "image",
            },
            {
              token: "2",
              title: "Sample Image 2",
              display_url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
              media_type: "image",
            },
          ],
          pagy: {
            current_page: 1,
            total_pages: 1,
          },
        }),
    });
  }

  return originalFetch(url);
};

// Now initialize the SDK
PlaybookSDK.init({
  containerId: "gallery",
  organizationSlug: "test-org",
  getAccessToken: () => "test-token", // the mock above ignores it
});
```

## Next Steps

### Customize the Gallery

```javascript
PlaybookSDK.init({
  containerId: "gallery",
  organizationSlug: "your-org-slug",
  getAccessToken: () => fetch("/playbook/token").then((r) => r.json()).then((r) => r.token),

  // Disable features you don't need
  enableSearch: true,
  enableBoards: true,
  enableModal: true,
  enableDownload: true,

  // Customize columns
  columnBreakpoints: {
    default: 1, // 1 column on mobile
    768: 2, // 2 on tablet
    1024: 3, // 3 on desktop
  },

  // Add event handlers
  onAssetClick: function (asset) {
    // Track analytics
    gtag("event", "asset_view", { asset_token: asset.token });
  },
});
```

### Control the Gallery Programmatically

```javascript
// Refresh the gallery
gallery.refresh();

// Trigger a search
gallery.search("logo");

// Select a board
gallery.selectBoardById("brand-assets");

// Get current assets
const assets = gallery.getAssets();
console.log(`Showing ${assets.length} assets`);
```

### Style Customization

Override the default styles:

```css
/* Make images rounded */
.pb-masonry-item img {
  border-radius: 16px !important;
}

/* Change active board color */
.pb-board-btn.active {
  background-color: #your-brand-color !important;
}

/* Customize modal */
.pb-modal-content {
  border-radius: 24px !important;
  background: linear-gradient(to bottom, #fff, #f9fafb) !important;
}
```

## Common Customizations

### 1. Different Column Layouts

```javascript
// More columns on large screens
columnBreakpoints: {
    default: 2,
    768: 3,
    1024: 5,
    1536: 7
}
```

### 2. Disable Certain Features

```javascript
// Gallery without search
enableSearch: false,

// Gallery without boards
enableBoards: false,

// Gallery without modal (custom click handler)
enableModal: false,
onAssetClick: function(asset) {
    // Your custom logic
    window.location.href = `/asset/${asset.token}`;
}
```

### 3. Track User Actions

```javascript
PlaybookSDK.init({
  containerId: "gallery",
  organizationSlug: "your-org-slug",
  getAccessToken: () => fetch("/playbook/token").then((r) => r.json()).then((r) => r.token),

  onSearch: function (query) {
    // Track searches
    analytics.track("Gallery Search", { query });
  },

  onAssetClick: function (asset) {
    // Track views
    analytics.track("Asset Viewed", {
      assetToken: asset.token,
      assetTitle: asset.title,
    });
  },

  onDownload: function (asset) {
    // Track downloads
    analytics.track("Asset Downloaded", {
      assetToken: asset.token,
    });
  },
});
```

## Troubleshooting

### Gallery Not Showing?

1. Check console for errors
2. Verify container ID matches
3. Ensure API is accessible
4. Check API response format

### Images Not Loading?

1. Verify image URLs are correct
2. Check CORS headers if images are on different domain
3. Ensure `url` or `thumbnail_url` fields exist

### Search Not Working?

1. Verify `enableSearch: true`
2. Check that API supports `?search=` parameter
3. Look for JavaScript errors in console

## Support

- Documentation: See README.md for full documentation
- GitHub Issues: Report bugs at github.com/playbook-sdk/issues
- Email: <support@playbook.com>

## What's Next?

- [React Integration Guide](./react-integration.md)
- API Reference: See README.md for complete configuration options
