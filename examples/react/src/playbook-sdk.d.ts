/**
 * Type definitions for Playbook Gallery SDK
 */

declare global {
  interface Window {
    PlaybookSDK: PlaybookSDKNamespace;
  }
}

export interface Asset {
  id: string;
  name?: string;
  title?: string;
  url: string;
  thumbnail_url?: string;
  display_url?: string;
  type?: "image" | "video" | string;
  media_type?: string;
  tags?: string[];
  created_at?: string;
  [key: string]: unknown;
}

export interface Board {
  id: string;
  name: string;
  description?: string;
}

export interface ColumnBreakpoints {
  default: number;
  [key: number]: number;
}

export interface LoadMoreInfo {
  page: number;
  totalPages: number;
  assetsLoaded: number;
  hasMore: boolean;
}

export interface PlaybookSDKConfig {
  containerId: string;
  organizationSlug: string;

  authToken?: string;
  boardId?: string;

  perPage?: number;

  enableSearch?: boolean;
  enableBoards?: boolean;
  enableModal?: boolean;
  enableDownload?: boolean;
  enableInfo?: boolean;

  columnBreakpoints?: ColumnBreakpoints;

  onAssetClick?: (asset: Asset) => void;
  onSearch?: (query: string) => void;
  onBoardChange?: (boardId: string, boardTitle?: string) => void;
  onModalOpen?: (asset: Asset) => void;
  onModalClose?: () => void;
  onDownload?: (asset: Asset) => void;
  onLoadMore?: (info: LoadMoreInfo) => void;
}

export interface GalleryInstance {
  config: PlaybookSDKConfig;
  getAssets(): Asset[];
  hasMore(): boolean;
  loadMore(): Promise<boolean>;
  refresh(): void;
  search(query: string): void;
  selectBoardById(boardId: string): void;
  destroy(): void;
}

export interface PlaybookSDKNamespace {
  init: (config: PlaybookSDKConfig) => GalleryInstance;
  destroy: (containerId: string) => void;
  getInstance: (containerId: string) => GalleryInstance | null;
  instances: Record<string, GalleryInstance>;
}

export {};
