# React Integration Guide

This guide shows you how to integrate Playbook Gallery SDK into your React application.

## Installation

```bash
npm install playbook-sdk
```

## Basic Usage

### Functional Component with Hooks

```jsx
import React, { useEffect, useRef } from "react";
import PlaybookSDK from "playbook-sdk";

function Gallery() {
  const galleryRef = useRef(null);
  const sdkInstance = useRef(null);

  useEffect(() => {
    // Initialize SDK
    if (!sdkInstance.current) {
      sdkInstance.current = PlaybookSDK.init({
        containerId: "react-gallery",
        organizationSlug: "your-org-slug",
        getAccessToken: () => fetch("/playbook/token").then((r) => r.json()).then((r) => r.token),

        onAssetClick: (asset) => {
          console.log("Asset clicked:", asset);
        },

        onSearch: (query) => {
          console.log("Search:", query);
        },
      });
    }

    // Cleanup on unmount
    return () => {
      if (sdkInstance.current) {
        PlaybookSDK.destroy("react-gallery");
        sdkInstance.current = null;
      }
    };
  }, []);

  return (
    <div className='gallery-container'>
      <div id='react-gallery' ref={galleryRef} />
    </div>
  );
}

export default Gallery;
```

## Advanced: Controlled Component

```jsx
import React, { useEffect, useRef, useState } from "react";
import PlaybookSDK from "playbook-sdk";

function ControlledGallery({ organizationSlug, onAssetSelect }) {
  const [currentAsset, setCurrentAsset] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const sdkInstance = useRef(null);

  useEffect(() => {
    if (!sdkInstance.current) {
      sdkInstance.current = PlaybookSDK.init({
        containerId: "controlled-gallery",
        organizationSlug: organizationSlug,
        getAccessToken: () => fetch("/playbook/token").then((r) => r.json()).then((r) => r.token),

        onAssetClick: (asset) => {
          setCurrentAsset(asset);
          onAssetSelect?.(asset);
        },

        onSearch: (query) => {
          setSearchQuery(query);
        },
      });
    }

    return () => {
      if (sdkInstance.current) {
        PlaybookSDK.destroy("controlled-gallery");
        sdkInstance.current = null;
      }
    };
  }, [organizationSlug, onAssetSelect]);

  const handleRefresh = () => {
    sdkInstance.current?.refresh();
  };

  const handleSearch = (query) => {
    sdkInstance.current?.search(query);
  };

  return (
    <div>
      {/* Custom controls */}
      <div className='controls mb-4'>
        <button onClick={handleRefresh}>Refresh Gallery</button>
        <input
          type='text'
          placeholder='External search...'
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* SDK Container */}
      <div id='controlled-gallery' />

      {/* Display selected asset */}
      {currentAsset && (
        <div className='mt-4 p-4 bg-gray-100 rounded'>
          <h3>Selected: {currentAsset.title}</h3>
          <p>Token: {currentAsset.token}</p>
        </div>
      )}
    </div>
  );
}

export default ControlledGallery;
```

## Using with React Router

```jsx
import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Gallery from "./components/Gallery";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/gallery' element={<Gallery />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

## TypeScript Support

Create a type definition file `playbook-sdk.d.ts`:

```typescript
declare module "playbook-sdk" {
  export interface Asset {
    token: string;
    title: string;
    display_url?: string;
    thumbnail_url?: string;
    media_type?: string;
    tags?: string[];
    created_at?: string;
    variant_badges?: string[];
    first_displayable_child?: Asset;
  }

  export interface Board {
    token: string;
    title: string;
    description?: string;
  }

  export interface Config {
    containerId: string;
    organizationSlug: string;
    getAccessToken?: () => string | Promise<string>;
    /** @deprecated Use `getAccessToken` to return a short-lived, backend-minted token instead. */
    authToken?: string;
    boardId?: string;
    enableSearch?: boolean;
    enableBoards?: boolean;
    enableModal?: boolean;
    enableDownload?: boolean;
    enableInfo?: boolean;
    columnBreakpoints?: {
      default?: number;
      [key: number]: number;
    };
    onAssetClick?: (asset: Asset) => void;
    onSearch?: (query: string) => void;
    onBoardChange?: (boardId: string, boardTitle: string) => void;
    onModalOpen?: (asset: Asset) => void;
    onModalClose?: () => void;
    onDownload?: (asset: Asset) => void;
  }

  export interface GalleryInstance {
    refresh(): void;
    search(query: string): void;
    selectBoardById(boardId: string): void;
    getAssets(): Asset[];
    destroy(): void;
  }

  export default class PlaybookSDK {
    static init(config: Config): GalleryInstance;
    static destroy(containerId: string): void;
    static getInstance(containerId: string): GalleryInstance | null;
  }
}
```

Then use it in your component:

```tsx
import React, { useEffect, useRef } from "react";
import PlaybookSDK, { Asset, GalleryInstance } from "playbook-sdk";

const Gallery: React.FC = () => {
  const sdkInstance = useRef<GalleryInstance | null>(null);

  useEffect(() => {
    sdkInstance.current = PlaybookSDK.init({
      containerId: "ts-gallery",
      organizationSlug: "your-org-slug",
      getAccessToken: () => fetch("/playbook/token").then((r) => r.json()).then((r) => r.token),

      onAssetClick: (asset: Asset) => {
        console.log("Clicked:", asset.title);
      },
    });

    return () => {
      if (sdkInstance.current) {
        PlaybookSDK.destroy("ts-gallery");
      }
    };
  }, []);

  return <div id='ts-gallery' />;
};

export default Gallery;
```

## Best Practices

1. **Always cleanup** - Use the cleanup function in useEffect
2. **Unique IDs** - Use unique container IDs if you have multiple galleries
3. **Ref usage** - Store SDK instance in useRef, not useState
4. **Memoization** - Memoize callbacks if they depend on props
5. **Error handling** - Wrap init in try-catch

## Common Issues

### Issue: Gallery not rendering

**Solution**: Ensure the container div is in the DOM before calling init()

```jsx
useEffect(() => {
    // Add a small delay if needed
    const timer = setTimeout(() => {
        sdkInstance.current = PlaybookSDK.init({...});
    }, 0);

    return () => clearTimeout(timer);
}, []);
```

### Issue: Multiple initializations

**Solution**: Check if instance already exists

```jsx
if (!sdkInstance.current) {
    sdkInstance.current = PlaybookSDK.init({...});
}
```

### Issue: Memory leaks

**Solution**: Always destroy in cleanup

```jsx
return () => {
  if (sdkInstance.current) {
    PlaybookSDK.destroy("gallery-id");
    sdkInstance.current = null;
  }
};
```
