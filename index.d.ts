/**
 * Playbook Gallery SDK TypeScript Definitions
 */

declare module "playbook-sdk" {
  /**
   * Represents a media asset in the gallery
   */
  export interface Asset {
    /** Unique identifier for the asset */
    id: string;
    /** Display name of the asset */
    name?: string;
    /** Display title of the asset */
    title?: string;
    /** Full-size URL of the asset */
    url: string;
    /** Thumbnail URL of the asset (optimized for grid view) */
    thumbnail_url?: string;
    /** Display URL used in the gallery view */
    display_url?: string;
    /** Asset type (e.g., "image", "video") */
    type?: "image" | "video" | string;
    /** Tags associated with the asset */
    tags?: string[];
    /** ISO8601 timestamp of when the asset was created */
    created_at?: string;
    /** Collection type indicator (used to filter boards) */
    collection_type?: string;
    /** Variant badges for grouped assets */
    variant_badges?: string[];
    /** First displayable child for variant groups */
    first_displayable_child?: {
      display_url?: string;
      [key: string]: any;
    };
    /** Allow additional properties */
    [key: string]: any;
  }

  /**
   * Represents a board/category in the gallery
   */
  export interface Board {
    /** Unique identifier for the board */
    id?: string;
    /** Alternative token identifier */
    token?: string;
    /** Display name of the board */
    name?: string;
    /** Alternative title property */
    title?: string;
    /** Optional board description */
    description?: string;
    /** Allow additional properties */
    [key: string]: any;
  }

  /**
   * Column breakpoint configuration for responsive grid layout
   */
  export interface ColumnBreakpoints {
    /** Default number of columns for mobile (< 768px) */
    default: number;
    /** Number of columns at 768px (tablet) */
    768?: number;
    /** Number of columns at 1024px (desktop) */
    1024?: number;
    /** Number of columns at 1280px (large desktop) */
    1280?: number;
    /** Number of columns at 1536px (XL screens) */
    1536?: number;
    /** Number of columns at 1800px (2XL screens) */
    1800?: number;
    /** Number of columns at 2000px (ultra-wide) */
    2000?: number;
    /** Allow custom breakpoints */
    [breakpoint: number]: number;
  }

  /**
   * Custom styles override object
   */
  export interface CustomStyles {
    [selector: string]: string | React.CSSProperties;
  }

  /**
   * Information about load more operation
   */
  export interface LoadMoreInfo {
    /** Current page number */
    page: number;
    /** Total number of pages */
    totalPages: number;
    /** Total assets loaded so far */
    assetsLoaded: number;
    /** Whether more assets are available */
    hasMore: boolean;
  }

  /**
   * Configuration options for initializing the gallery
   */
  export interface PlaybookConfig {
    /**
     * ID of the DOM element where the gallery will be rendered
     * @required
     */
    containerId: string;

    /**
     * Organization slug for your Playbook workspace
     * The API URL will be automatically constructed as https://api.playbook.com/v1/{organizationSlug}
     * @required
     */
    organizationSlug: string;

    /**
     * Returns a short-lived access token for API requests. Called before the
     * first request and again after a 401; the SDK caches the result in memory
     * only and never persists it. Have your backend mint a short-lived,
     * board-scoped token rather than shipping a long-lived one to the browser.
     *
     * Required unless the deprecated `authToken` is provided.
     */
    getAccessToken?: () => string | Promise<string>;

    /**
     * Static authentication token, sent as "Authorization: Bearer {token}".
     * @deprecated A long-lived token in client code is extractable from page
     * source. Use `getAccessToken` instead; this is wrapped as a provider with
     * a console warning and will be removed in a future version.
     */
    authToken?: string;

    /**
     * Optional board ID to scope the gallery to a specific board
     */
    boardId?: string;

    /**
     * Number of assets to load per page
     * @default 20
     */
    perPage?: number;

    /**
     * Responsive column breakpoints configuration
     * Defines how many columns to display at different viewport widths
     * @default { default: 2, 768: 3, 1024: 4, 1280: 5, 1536: 6, 1800: 7, 2000: 8 }
     */
    columnBreakpoints?: ColumnBreakpoints;

    /**
     * Enable/disable search functionality
     * @default true
     */
    enableSearch?: boolean;

    /**
     * Enable/disable board filtering functionality
     * @default true
     */
    enableBoards?: boolean;

    /**
     * Enable/disable modal viewer for assets
     * @default true
     */
    enableModal?: boolean;

    /**
     * Enable/disable download button in modal
     * @default true
     */
    enableDownload?: boolean;

    /**
     * Enable/disable info button in modal
     * @default true
     */
    enableInfo?: boolean;

    /**
     * Theme selection (currently only "light" supported)
     * @default "light"
     */
    theme?: "light" | "dark";

    /**
     * Custom CSS styles to override default styles
     */
    customStyles?: CustomStyles;

    /**
     * Callback fired when an asset is clicked
     * @param asset - The clicked asset object
     */
    onAssetClick?: (asset: Asset) => void;

    /**
     * Callback fired when search is performed
     * @param query - The search query string
     */
    onSearch?: (query: string) => void;

    /**
     * Callback fired when a board is selected
     * @param boardId - The ID of the selected board ("all" for all assets)
     * @param boardTitle - The title of the selected board
     */
    onBoardChange?: (boardId: string, boardTitle?: string) => void;

    /**
     * Callback fired when modal opens
     * @param asset - The asset being displayed in the modal
     */
    onModalOpen?: (asset: Asset) => void;

    /**
     * Callback fired when modal closes
     */
    onModalClose?: () => void;

    /**
     * Callback fired when an asset is downloaded
     * @param asset - The asset being downloaded
     */
    onDownload?: (asset: Asset) => void;

    /**
     * Callback fired when more assets are loaded
     * @param info - Information about the load more operation
     */
    onLoadMore?: (info: LoadMoreInfo) => void;
  }

  /**
   * Represents an instance of a gallery
   * Returned by PlaybookSDK.init() and used to interact with a specific gallery
   */
  export interface GalleryInstance {
    /** Configuration used for this instance */
    config: PlaybookConfig;
    /** DOM container element */
    container: HTMLElement;
    /** Currently displayed assets */
    currentAssets: Asset[];
    /** All fetched assets (before filtering) */
    allAssets: Asset[];
    /** Available boards */
    currentBoards: Board[];
    /** Whether the modal is currently open */
    modalOpen: boolean;
    /** Index of currently viewed asset in modal */
    currentAssetIndex: number;
    /** Currently selected board ID */
    currentBoardId: string;
    /** Current search query */
    currentSearchQuery: string;
    /** Whether data is currently being loaded */
    loading: boolean;

    /**
     * Refresh the gallery by re-fetching assets with current filters
     */
    refresh(): void;

    /**
     * Programmatically perform a search
     * @param query - Search query string
     */
    search(query: string): void;

    /**
     * Programmatically select a board
     * @param boardId - Board ID to select ("all" for all assets)
     */
    selectBoardById(boardId: string): void;

    /**
     * Get the currently displayed assets
     * @returns Array of current assets
     */
    getAssets(): Asset[];

    /**
     * Check if more assets are available to load
     * @returns True if more assets can be loaded
     */
    hasMore(): boolean;

    /**
     * Load the next page of assets
     * @returns Promise that resolves to true if more assets were loaded
     */
    loadMore(): Promise<boolean>;

    /**
     * Destroy the gallery instance and clean up DOM
     */
    destroy(): void;
  }

  /**
   * Main PlaybookSDK namespace
   */
  export interface PlaybookSDKInterface {
    /** SDK version string */
    version: string;

    /** Map of all active gallery instances by container ID */
    instances: { [containerId: string]: GalleryInstance };

    /**
     * Initialize a new gallery instance
     * @param config - Configuration options for the gallery
     * @returns Gallery instance or null if container not found
     * @throws Will log error if container element doesn't exist
     */
    init(config: PlaybookConfig): GalleryInstance | null;

    /**
     * Destroy a gallery instance by container ID
     * @param containerId - ID of the container to destroy
     */
    destroy(containerId: string): void;

    /**
     * Get an existing gallery instance by container ID
     * @param containerId - ID of the container
     * @returns Gallery instance or null if not found
     */
    getInstance(containerId: string): GalleryInstance | null;
  }

  const PlaybookSDK: PlaybookSDKInterface;
  export default PlaybookSDK;
}

declare module "playbook-sdk/uploader" {
  import { Asset } from "playbook-sdk";

  /** The one-time, signed upload target your backend returns to the browser. */
  export interface UploadTarget {
    /** Signed, single-use URL the bytes are sent to. */
    uploadUrl: string;
    /** HTTP method for the upload request (default "PUT"). */
    method?: string;
    /** Request headers (default `{ "Content-Type": file.type }`). */
    headers?: { [key: string]: string };
    /** Opaque data passed back to finishUpload (e.g. the signed GCS id). */
    finalize?: any;
  }

  export interface UploaderConfig {
    /** ID of the container element the uploader renders into. */
    containerId?: string;
    /**
     * REQUIRED. Returns a signed upload target minted by YOUR backend via
     * Playbook's create_upload_url. Never return a write token to the browser.
     */
    getUploadTarget: (file: File) => Promise<UploadTarget>;
    /**
     * Called after the bytes land so your backend can call Playbook's
     * finish_upload and return the created asset.
     */
    finishUpload?: (finalize: any, file: File) => Promise<Asset>;
    /** "dropzone" (full drag area, default) or "button" (compact trigger). */
    variant?: "dropzone" | "button";
    /** Accepted MIME types for the file input (default "image/*,video/*"). */
    accept?: string;
    /** Max file size in bytes (default 104857600 — the create_upload_url ceiling). */
    maxFileSizeBytes?: number;
    /** Max number of files per selection (0 = unlimited). */
    maxFiles?: number;
    /** Allow selecting multiple files (default true). */
    multiple?: boolean;
    /** Begin uploading as soon as files are selected (default true). */
    autoUpload?: boolean;
    /** Dropzone/button copy. */
    labels?: { prompt?: string; hint?: string; button?: string };
    onSelect?: (files: File[]) => void;
    onProgress?: (file: File, pct: number) => void;
    onFileComplete?: (asset: Asset | null, file: File) => void;
    onComplete?: (assets: Array<Asset | null>) => void;
    onError?: (error: Error, file: File) => void;
  }

  export interface UploaderInstance {
    config: UploaderConfig;
    container: HTMLElement;
    /** Destroy the uploader instance and clean up DOM + listeners. */
    destroy(): void;
  }

  export interface PlaybookUploaderInterface {
    version: string;
    instances: { [containerId: string]: UploaderInstance };
    /** Initialize a new uploader instance (null if container not found). */
    init(config: UploaderConfig): UploaderInstance | null;
    /** Destroy an uploader instance by container ID. */
    destroy(containerId: string): void;
  }

  const PlaybookUploader: PlaybookUploaderInterface;
  export default PlaybookUploader;
}

declare module "playbook-sdk/viewer" {
  /** A single viewable asset. */
  export interface ViewerItem {
    /** Full-size URL of the image or video. */
    src: string;
    /** MIME type; a value starting with "video" renders a <video>. */
    type?: string;
    /** Optional caption. */
    title?: string;
  }

  export interface ViewerOpenOptions extends Partial<ViewerItem> {
    /** A navigable set; takes precedence over a single src/type/title. */
    items?: ViewerItem[];
    /** Starting index into `items` (default 0). */
    index?: number;
  }

  export interface PlaybookViewerInterface {
    version: string;
    /** Open the lightbox for one asset or a navigable set. */
    open(options: ViewerOpenOptions): void;
    /** Close the lightbox. */
    close(): void;
    /** Advance to the next item in a set. */
    next(): void;
    /** Go to the previous item in a set. */
    prev(): void;
  }

  const PlaybookViewer: PlaybookViewerInterface;
  export default PlaybookViewer;
}

/**
 * Global type declaration for browser script tag usage
 */
declare global {
  interface Window {
    PlaybookSDK: import("playbook-sdk").PlaybookSDKInterface;
    PlaybookUploader: import("playbook-sdk/uploader").PlaybookUploaderInterface;
    PlaybookViewer: import("playbook-sdk/viewer").PlaybookViewerInterface;
  }
}
