# Playbook SDK - React + TypeScript

A comprehensive demo application showcasing the full capabilities of the **Playbook Gallery SDK** integrated into a modern React + TypeScript application.

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ installed
- npm or yarn package manager

### Installation

```bash
cd examples/react
npm install
npm run dev
```

The app will automatically open in your browser at `http://localhost:3000`

### Build for Production

```bash
# Create optimized production build
npm run build

# Preview production build
npm run preview
```

### Customizing the Demo

**To use your own Playbook data:**

1. Open `src/App.tsx`
2. Update the `SDK_CONFIG` object with your credentials:
   - `authToken` - Your API authentication token
   - `organizationSlug` - Your organization identifier
   - `boardId` - Specific board/collection ID (optional)

**To modify SDK features:**

In `src/App.tsx`, adjust the `PlaybookSDKConfig` object:

```typescript
const config: PlaybookSDKConfig = {
  // Toggle features
  enableSearch: true, // Enable/disable search bar
  enableBoards: true, // Enable/disable board navigation
  enableModal: true, // Enable/disable modal viewer
  enableDownload: true, // Enable/disable download buttons
  enableInfo: true, // Enable/disable asset info

  // Customize responsive grid
  columnBreakpoints: {
    default: 2, // Mobile
    640: 2, // Small tablets
    768: 3, // Tablets
    1024: 4, // Laptops
    1280: 5, // Desktops
    1536: 6, // Large desktops
    1800: 7, // Ultra-wide
  },
};
```

**Note:** The Playbook SDK is copied to the `public/` folder and loaded dynamically by React at runtime.

## 🎨 SDK events

```typescript
// Asset clicked - fires when user clicks any asset
onAssetClick: (asset: Asset) => {
  // Track views, analytics, etc.
};

// Search performed - fires on search query changes
onSearch: (query: string) => {
  // Track search behavior
};

// Board changed - fires when user switches collections
onBoardChange: (boardId: string, boardTitle?: string) => {
  // Update UI, track navigation
};

// Modal opened - fires when fullscreen viewer opens
onModalOpen: (asset: Asset) => {
  // Track engagement
};

// Modal closed - fires when viewer closes
onModalClose: () => {
  // Reset state
};

// Download initiated - fires when user downloads asset
onDownload: (asset: Asset) => {
  // Track downloads, show confirmation
};
```

## 🎮 Interactive Features

### Analytics Dashboard

- **Total Assets** - Live count of assets in current view
- **Assets Viewed** - Tracks modal opens
- **Searches** - Counts search queries performed
- **Downloads** - Tracks download button clicks

### Event Log

- Real-time logging of all SDK interactions
- Color-coded by event type (info, success, warning, error)
- Scrollable history with timestamps
- Clear and hide/show functionality

### Gallery Controls

- **Refresh** - Reload gallery data
- **Restart** - Destroy and reinitialize SDK
