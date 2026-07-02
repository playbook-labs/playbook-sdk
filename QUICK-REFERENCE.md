# Quick Reference

## Minimal Setup

```html
<div id="gallery"></div>
<script src="playbook-sdk.min.js"></script>
<script>
  PlaybookSDK.init({
    containerId: "gallery",
    organizationSlug: "your-org-slug",
    authToken: "your-token-here",
  });
</script>
```

## 📦 Installation Methods

```bash
# npm
npm install playbook-sdk

# CDN
<script src="https://unpkg.com/playbook-sdk@latest/dist/playbook-sdk.min.js"></script>

# Download
# Use dist/playbook-sdk.min.js from this package
```

## ⚙️ Configuration

```javascript
PlaybookSDK.init({
  // Required
  containerId: "my-gallery",
  organizationSlug: "your-org-slug",
  authToken: "your-token-here",

  // Optional: Root board (limits gallery to this board + children only)
  boardId: "",

  // Features (all optional, defaults shown)
  enableSearch: true,
  enableBoards: true,
  enableModal: true,
  enableDownload: true,
  enableInfo: true,

  // Responsive columns
  columnBreakpoints: {
    default: 2, // Mobile
    768: 3, // Tablet
    1024: 4, // Desktop
    1280: 5, // Large
    1536: 6, // XL
    1800: 7, // 2XL
    2000: 8, // Ultra-wide
  },

  // Callbacks
  onAssetClick: (asset) => {},
  onSearch: (query) => {},
  onBoardChange: (boardId) => {},
  onModalOpen: (asset) => {},
  onModalClose: () => {},
  onDownload: (asset) => {},
});
```

## 🎯 Public API

```javascript
const gallery = PlaybookSDK.init({...});

gallery.refresh();              // Reload assets
gallery.search('query');        // Search programmatically
gallery.selectBoardById('id');  // Select board
gallery.getAssets();            // Get current assets array
gallery.destroy();              // Cleanup and remove

PlaybookSDK.destroy('id');      // Destroy by container ID
PlaybookSDK.getInstance('id');  // Get existing instance
```

## 📡 Playbook API Endpoints

### GET /{organizationSlug}/boards

```json
{ "data": [{ "token": "abc", "title": "Board 1" }] }
```

### GET /{organizationSlug}/assets?query=search&board_id=token

```json
{
  "data": [
    {
      "token": "xyz",
      "title": "Asset Name",
      "display_url": "https://cdn.playbook.com/asset.png",
      "media_type": "image/png"
    }
  ]
}
```

**Authentication:** All requests require `Authorization: Bearer {token}` header

## 🎨 CSS Classes

All classes are prefixed with `pb-` to avoid conflicts:

```css
.pb-masonry             
.pb-masonry-item        /* Individual item */
.pb-modal-overlay       /* Modal background */
.pb-modal-content       /* Modal container */
.pb-board-btn           /* Board button */
.pb-board-btn.active; /* Active board */
```

## ⌨️ Keyboard Shortcuts

| Key   | Action         |
| ----- | -------------- |
| `←`   | Previous asset |
| `→`   | Next asset     |
| `Esc` | Close modal    |

## 🔧 Common Customizations

### Disable Features

```javascript
enableSearch: false,
enableBoards: false,
enableModal: false
```

### Custom Columns

```javascript
columnBreakpoints: {
  default: 1,
  768: 2,
  1024: 3
}
```

### Track Events

```javascript
onAssetClick: (asset) => {
  gtag("event", "view", { asset_id: asset.id });
};
```

### Custom Styling

```css
.pb-masonry-item img {
  border-radius: 20px !important;
}
.pb-board-btn.active {
  background: #your-color !important;
}
```

## 🐛 Troubleshooting

| Problem                     | Solution                                      |
| --------------------------- | --------------------------------------------- |
| Gallery not showing         | Check container ID, API URL, console errors   |
| Images not loading          | Verify URLs, check CORS, confirm API response |
| Search not working          | Enable search, check API ?search= support     |
| Multiple instances conflict | Use unique container IDs                      |

## 📱 React Integration

```jsx
import PlaybookSDK from "playbook-sdk";

function Gallery() {
  useEffect(() => {
    const g = PlaybookSDK.init({
      containerId: "gallery",
      organizationSlug: "your-org-slug",
      authToken: "your-token-here",
    });
    return () => PlaybookSDK.destroy("gallery");
  }, []);

  return <div id='gallery' />;
}
```

## 📋 Checklist

Before going live:

- [ ] API endpoints working (/boards, /assets)
- [ ] Images accessible (check CORS)
- [ ] Container ID is unique
- [ ] SDK file included
- [ ] Test on mobile
- [ ] Test search functionality
- [ ] Test modal navigation
- [ ] Test board switching
- [ ] Add error handling
- [ ] Track analytics (optional)

## 📚 Documentation Files

- `README.md` - Full documentation
- `docs/getting-started.md` - Tutorial
- `docs/react-integration.md` - React guide
- `CHANGELOG.md` - Release history

## 🎯 File Locations

```
playbook-sdk/
├── dist/playbook-sdk.min.js  ← Main SDK file
├── examples/
│   ├── minimal-example.html  ← Simple demo
│   └── complete-example.html ← Full demo
├── docs/                     ← Guides
├── package.json              ← npm config
└── README.md                 ← Main docs
```

## 🚢 Publishing

```bash
# Test locally
npm run build

# Publish to npm
npm login
npm publish

# Use in projects
npm install playbook-sdk
```

## Tips

1. Test with mock data first (see complete-example.html)
2. Use callbacks for analytics tracking
3. Customize breakpoints for your design
4. Prefix your styles if overriding defaults
5. Always cleanup in React/Vue components
6. Check console for error messages
7. Use TypeScript definitions (in React guide)

## 📞 Support

- Check examples/ folder for working code
- Read docs/ for detailed guides
- Test with complete-example.html
- Verify API response format

