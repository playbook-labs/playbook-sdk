/**
 * Playbook Gallery SDK
 *
 * Source of truth. Build with `npm run build` to emit dist/playbook-sdk.js
 * (readable) and dist/playbook-sdk.min.js (minified). The `__PB_VERSION__`
 * token below is replaced with the package.json version at build time.
 */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
    ? define(factory)
    : ((global = global || self), (global.PlaybookSDK = factory()));
})(this, function () {
  "use strict";

  const PlaybookSDK = {
    version: __PB_VERSION__,
    instances: {},

    init: function (config) {
      const defaultConfig = {
        containerId: "__playbook-embed",
        authToken: "",
        organizationSlug: "",
        boardId: "",
        perPage: 50,
        columnBreakpoints: {
          default: 2,
          768: 3,
          1024: 4,
          1280: 5,
          1536: 6,
          1800: 7,
          2000: 8,
        },
        enableSearch: true,
        enableBoards: true,
        enableModal: true,
        enableDownload: true,
        enableInfo: true,
        theme: "light",
        customStyles: {},
        onAssetClick: null,
        onSearch: null,
        onBoardChange: null,
        onModalOpen: null,
        onModalClose: null,
        onDownload: null,
        onLoadMore: null,
      };

      const settings = { ...defaultConfig, ...config };

      if (!settings.organizationSlug) {
        console.error("Playbook SDK: organizationSlug is required");
        return null;
      }

      if (!settings.authToken) {
        console.error("Playbook SDK: authToken is required");
        return null;
      }

      settings.apiBaseUrl = `https://api.playbook.com/v1/${settings.organizationSlug}`;

      const container = document.getElementById(settings.containerId);

      if (!container) {
        console.error(
          `Playbook SDK: Container #${settings.containerId} not found`
        );
        return null;
      }

      if (this.instances[settings.containerId]) {
        this.instances[settings.containerId].destroy();
        delete this.instances[settings.containerId];
      }

      this._injectStyles(settings);

      const instance = new GalleryInstance(settings, container);
      this.instances[settings.containerId] = instance;

      return instance;
    },

    destroy: function (containerId) {
      if (this.instances[containerId]) {
        this.instances[containerId].destroy();
        delete this.instances[containerId];
      }
    },

    getInstance: function (containerId) {
      return this.instances[containerId] || null;
    },

    _injectStyles: function (settings) {
      if (document.getElementById("playbook-sdk-styles")) return;

      const breakpoints = settings.columnBreakpoints;
      let mediaQueries = "";

      Object.keys(breakpoints).forEach((bp) => {
        if (bp === "default") return;
        mediaQueries += `
          @media (min-width: ${bp}px) {
            .pb-masonry { column-count: ${breakpoints[bp]}; }
          }`;
      });

      const styles = `
        .pb-masonry {
          column-count: ${breakpoints.default};
          column-gap: 1rem;
        }
        ${mediaQueries}
        
        .pb-masonry-item {
          break-inside: avoid-column;
          margin-bottom: 1rem;
        }

        .pb-masonry-item img {
          margin: 0 auto;
          display: block;
          width: 100%;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .pb-masonry-item:hover img {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .pb-search-container {
          max-width: 600px;
          margin: 0 auto 2rem;
        }

        .pb-clickable {
          cursor: pointer;
        }

        .pb-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.75);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          animation: pb-fadeIn 0.2s ease-out;
        }

        @keyframes pb-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .pb-modal-content {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
          background-color: white;
          border-radius: 12px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          overflow: hidden;
          animation: pb-slideUp 0.3s ease-out;
        }

        @keyframes pb-slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .pb-modal-body {
          display: flex;
          flex-direction: column;
          padding: 2rem;
          max-height: 90vh;
          overflow-y: auto;
        }

        .pb-modal-asset {
          position: relative;
          width: 100%;
          max-height: 70vh;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .pb-modal-asset img,
        .pb-modal-asset video {
          max-width: 100%;
          max-height: 70vh;
          object-fit: contain;
          border-radius: 8px;
        }

        .pb-modal-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background-color: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transition: all 0.2s;
          z-index: 10;
        }

        .pb-modal-nav:hover {
          background-color: white;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .pb-modal-nav.left { left: 1rem; }
        .pb-modal-nav.right { right: 1rem; }

        .pb-modal-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background-color: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transition: all 0.2s;
          z-index: 20;
        }

        .pb-modal-close:hover {
          background-color: white;
          transform: rotate(90deg);
        }

        .pb-modal-actions {
          position: absolute;
          bottom: 1.5rem;
          right: 1.5rem;
          display: flex;
          gap: 0.75rem;
          z-index: 10;
        }

        .pb-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border-radius: 9999px;
          background-color: rgba(255, 255, 255, 0.9);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .pb-btn:hover {
          background-color: white;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }

        .pb-btn-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pb-boards {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 2rem;
        }

        .pb-board-btn {
          padding: 0.5rem 1.25rem;
          border-radius: 9999px;
          border: 1px solid #e5e7eb;
          background-color: white;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .pb-board-btn:hover {
          background-color: #f9fafb;
          border-color: #d1d5db;
        }

        .pb-board-btn.active {
          background-color: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .pb-hidden {
          display: none !important;
        }

        .pb-loading {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 3rem;
          color: #6b7280;
        }

        .pb-spinner {
          border: 3px solid #f3f4f6;
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: pb-spin 1s linear infinite;
        }

        @keyframes pb-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .pb-error {
          padding: 2rem;
          text-align: center;
          color: #ef4444;
          background-color: #fef2f2;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .pb-modal-content {
            max-width: 95vw;
            max-height: 95vh;
          }
          
          .pb-modal-body {
            padding: 1rem;
          }

          .pb-modal-nav {
            width: 40px;
            height: 40px;
          }

          .pb-modal-actions {
            bottom: 1rem;
            right: 1rem;
          }

          .pb-btn {
            padding: 0.5rem 1rem;
            font-size: 0.75rem;
          }
        }
      `;

      const styleTag = document.createElement("style");
      styleTag.id = "playbook-sdk-styles";
      styleTag.textContent = styles;
      document.head.appendChild(styleTag);
    },
  };

  class GalleryInstance {
    constructor(config, container) {
      this.config = config;
      this.container = container;
      this.currentAssets = [];
      this.allLoadedAssets = [];
      this.currentBoards = [];
      this.boardHierarchy = [];
      this.currentParentBoard = null;
      this.modalOpen = false;
      this.currentAssetIndex = -1;
      this.currentBoardId = "all";
      this.currentSearchQuery = "";
      this.useAiSearch = false;
      this.loading = false;
      this.currentPage = 1;
      this.totalPages = 1;
      this.perPage = config.perPage || 50;
      this.eventListeners = [];
      this.abortController = null;
      this.hasMoreAssets = false;

      this.init();
    }

    init() {
      this.container.classList.add("pb-container");

      if (this.config.boardId) {
        this.currentBoardId = this.config.boardId;
        this.fetchInitialBoardInfo(this.config.boardId);
      }

      if (this.config.enableSearch) {
        this.renderSearchBar();
      }

      if (this.config.enableBoards) {
        this.renderBoardsContainer();
        this.fetchBoards(this.config.boardId || null);
      }

      this.renderMasonryGrid();
      this.renderPaginationContainer();
      this.attachEventListeners();
      this.fetchAssets("", this.config.boardId || "", 1);
    }

    renderSearchBar() {
      const searchHtml = `
        <div class="pb-search-wrapper">
          <div class="pb-search-container" style="display: flex; align-items: center; gap: 1rem;">
            <div style="position: relative; flex: 1;">
              <input type="text"
                     class="pb-search-input"
                     placeholder="Search objects, people, & more..."
                     style="width: 100%; padding: 0.75rem 2.5rem 0.75rem 3rem; border: 1px solid #d1d5db; border-radius: 9999px; outline: none; transition: all 0.2s;"
                     aria-label="Search items">

              <svg class="pb-search-icon" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); width: 1.25rem; height: 1.25rem; color: #9ca3af;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>

              <button class="pb-clear-search pb-hidden" style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); width: 1.25rem; height: 1.25rem; color: #9ca3af; cursor: pointer; background: none; border: none; padding: 0;" aria-label="Clear search">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <label style="display: flex; align-items: center; gap: 0.5rem; white-space: nowrap; cursor: pointer; user-select: none;">
              <input type="checkbox" class="pb-ai-search-toggle" style="width: 1rem; height: 1rem; cursor: pointer;">
              <span style="font-size: 0.875rem; color: #6b7280;">AI Search</span>
            </label>

            <button class="pb-search-btn" style="padding: 0.75rem 1.5rem; border: 1px solid #d1d5db; border-radius: 9999px; background-color: #3b82f6; color: white; cursor: pointer; font-size: 0.875rem; font-weight: 500; white-space: nowrap; transition: all 0.2s;" aria-label="Search">
              Search
            </button>
          </div>
        </div>
      `;

      this.container.insertAdjacentHTML("beforeend", searchHtml);
    }

    renderBoardsContainer() {
      const boardsHtml = '<div class="pb-boards-container"></div>';
      this.container.insertAdjacentHTML("beforeend", boardsHtml);
    }

    renderMasonryGrid() {
      const gridHtml = '<div class="pb-masonry"></div>';
      this.container.insertAdjacentHTML("beforeend", gridHtml);
    }

    renderPaginationContainer() {
      const paginationHtml = '<div class="pb-pagination-container"></div>';
      this.container.insertAdjacentHTML("beforeend", paginationHtml);
    }

    renderPagination() {
      const paginationContainer = this.container.querySelector(
        ".pb-pagination-container"
      );
      if (!paginationContainer) return;

      if (this.totalPages <= 1) {
        paginationContainer.innerHTML = "";
        return;
      }

      let html =
        '<div class="pb-pagination" style="display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 2rem 0; margin-top: 2rem; border-top: 1px solid #e5e7eb;">';

      html += `<button class="pb-pagination-btn pb-pagination-prev" ${
        this.currentPage <= 1 ? "disabled" : ""
      } style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 0.375rem; background-color: white; cursor: ${
        this.currentPage <= 1 ? "not-allowed" : "pointer"
      }; opacity: ${this.currentPage <= 1 ? "0.5" : "1"};">← Previous</button>`;

      html += `<span style="color: #6b7280; font-size: 0.875rem;">Page <strong>${this.currentPage}</strong> of <strong>${this.totalPages}</strong></span>`;

      html += `<button class="pb-pagination-btn pb-pagination-next" ${
        this.currentPage >= this.totalPages ? "disabled" : ""
      } style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 0.375rem; background-color: white; cursor: ${
        this.currentPage >= this.totalPages ? "not-allowed" : "pointer"
      }; opacity: ${
        this.currentPage >= this.totalPages ? "0.5" : "1"
      };">Next →</button>`;

      html += "</div>";
      paginationContainer.innerHTML = html;
    }

    attachEventListeners() {
      const searchInput = this.container.querySelector(".pb-search-input");
      const clearButton = this.container.querySelector(".pb-clear-search");
      const searchButton = this.container.querySelector(".pb-search-btn");
      const aiToggle = this.container.querySelector(".pb-ai-search-toggle");

      if (searchInput) {
        const inputHandler = () => {
          clearButton?.classList[
            searchInput.value.length > 0 ? "remove" : "add"
          ]("pb-hidden");
        };
        searchInput.addEventListener("input", inputHandler);
        this.eventListeners.push({
          el: searchInput,
          evt: "input",
          fn: inputHandler,
        });

        const keyHandler = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.performSearch(searchInput.value);
            searchInput.blur();
          }
        };
        searchInput.addEventListener("keydown", keyHandler);
        this.eventListeners.push({
          el: searchInput,
          evt: "keydown",
          fn: keyHandler,
        });
      }

      if (searchButton && searchInput) {
        const clickHandler = () => this.performSearch(searchInput.value);
        searchButton.addEventListener("click", clickHandler);
        this.eventListeners.push({
          el: searchButton,
          evt: "click",
          fn: clickHandler,
        });
      }

      if (clearButton && searchInput) {
        const clickHandler = () => {
          searchInput.value = "";
          clearButton.classList.add("pb-hidden");
          this.clearSearch();
        };
        clearButton.addEventListener("click", clickHandler);
        this.eventListeners.push({
          el: clearButton,
          evt: "click",
          fn: clickHandler,
        });
      }

      if (aiToggle) {
        const changeHandler = (e) => {
          this.useAiSearch = e.target.checked;
        };
        aiToggle.addEventListener("change", changeHandler);
        this.eventListeners.push({
          el: aiToggle,
          evt: "change",
          fn: changeHandler,
        });
      }

      const containerClick = (e) => {
        const assetTrigger = e.target.closest(".pb-asset-trigger");
        if (assetTrigger) {
          const idx = parseInt(assetTrigger.dataset.assetIndex);
          if (!isNaN(idx)) this.openAssetModal(idx);
        }

        const boardButton = e.target.closest(".pb-board-btn");
        if (boardButton) {
          boardButton.dataset.action === "back"
            ? this.goBackToParent()
            : this.selectBoard(
                boardButton.dataset.boardId,
                boardButton.dataset.boardTitle
              );
        }

        const prevButton = e.target.closest(".pb-pagination-prev");
        if (prevButton && !prevButton.disabled)
          this.goToPage(this.currentPage - 1);

        const nextButton = e.target.closest(".pb-pagination-next");
        if (nextButton && !nextButton.disabled)
          this.goToPage(this.currentPage + 1);
      };
      this.container.addEventListener("click", containerClick);
      this.eventListeners.push({
        el: this.container,
        evt: "click",
        fn: containerClick,
      });
    }

    goToPage(page) {
      if (page < 1 || page > this.totalPages) return;
      this.currentPage = page;

      if (this.currentSearchQuery) {
        this.fetchSearchResults(this.currentSearchQuery, page);
      } else {
        this.fetchAssets(this.currentSearchQuery, this.currentBoardId, page);
      }

      this.container.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async fetchInitialBoardInfo(boardId) {
      try {
        const url = `${this.config.apiBaseUrl}/boards/${boardId}`;
        const headers = {
          "Content-Type": "application/json",
        };

        if (this.config.authToken) {
          headers["Authorization"] = `Bearer ${this.config.authToken}`;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new Error(`Failed to fetch board info: ${response.statusText}`);
        }

        const data = await response.json();
        const board = data.data || data.board || data;
        const boardTitle = board.title || board.name || boardId;

        this.currentBoardTitle = boardTitle;

        if (this.config.onBoardChange) {
          this.config.onBoardChange(boardId, boardTitle);
        }
      } catch (error) {
        console.error(
          "Playbook SDK: Failed to fetch initial board info",
          error
        );
        this.currentBoardTitle = boardId;
        if (this.config.onBoardChange) {
          this.config.onBoardChange(boardId, boardId);
        }
      }
    }

    async fetchBoards(parentBoardId = null) {
      try {
        let url;
        if (parentBoardId) {
          url = `${this.config.apiBaseUrl}/boards/${parentBoardId}/children`;
        } else {
          url = `${this.config.apiBaseUrl}/boards`;
        }

        const headers = {
          "Content-Type": "application/json",
        };

        if (this.config.authToken) {
          headers["Authorization"] = `Bearer ${this.config.authToken}`;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Authentication failed. Check your authToken.`);
          }
          if (response.status === 404) {
            throw new Error(`Organization not found. Check your organizationSlug.`);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(`Invalid response. Expected JSON but got ${contentType || "unknown"}`);
        }

        const data = await response.json();
        this.currentBoards = data.data || data.boards || [];
        this.renderBoards();
      } catch (error) {
        console.error("Playbook SDK: Failed to fetch boards -", error.message || error);
      }
    }

    renderBoards() {
      const boardsContainer = this.container.querySelector(
        ".pb-boards-container"
      );
      if (!boardsContainer) return;

      let html = '<div class="pb-boards">';

      html += `<button class="pb-board-btn ${
        this.currentBoardId === "all" ? "active" : ""
      }" data-board-id="all">All Assets</button>`;

      if (this.boardHierarchy.length > 0) {
        this.boardHierarchy.forEach((board, index) => {
          const isActive = this.currentBoardId === board.id ? "active" : "";
          html += `<span style="color: #9ca3af; padding: 0 0.5rem; display: inline-flex; align-items: center;">›</span>`;
          html += `<button class="pb-board-btn ${isActive}" data-board-id="${this.escapeHtml(
            board.id
          )}" data-board-title="${this.escapeHtml(
            board.title
          )}">${this.escapeHtml(board.title)}</button>`;
        });
      }

      if (this.currentBoards.length > 0 && this.currentBoardId !== "all") {
        html += `<span style="color: #9ca3af; padding: 0 0.5rem; display: inline-flex; align-items: center;">›</span>`;
      }

      this.currentBoards.forEach((board) => {
        const boardId = board.token || board.id;
        const boardName = board.title || board.name;
        const isActive = this.currentBoardId === boardId ? "active" : "";
        html += `<button class="pb-board-btn ${isActive}" data-board-id="${this.escapeHtml(
          boardId
        )}" data-board-title="${this.escapeHtml(
          boardName
        )}">${this.escapeHtml(boardName)}</button>`;
      });

      html += "</div>";
      boardsContainer.innerHTML = html;
    }

    async fetchAssets(query = "", boardId = "", page = 1, append = false) {
      if (this.loading) return;

      if (this.abortController) this.abortController.abort();
      this.abortController = new AbortController();

      this.loading = true;
      if (!append) {
        this.showLoading();
      }

      try {
        const params = new URLSearchParams({
          nested_assets: "true",
          page: page.toString(),
          per_page: this.perPage.toString(),
        });
        if (query) params.append("query", query);

        const url =
          boardId && boardId !== "all"
            ? `${this.config.apiBaseUrl}/boards/${boardId}/assets?${params}`
            : `${this.config.apiBaseUrl}/assets?${params}`;

        const headers = { "Content-Type": "application/json" };
        if (this.config.authToken)
          headers["Authorization"] = `Bearer ${this.config.authToken}`;

        const response = await fetch(url, {
          headers,
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Authentication failed. Check your authToken.`);
          }
          if (response.status === 404) {
            throw new Error(`Organization not found. Check your organizationSlug.`);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(`Invalid response. Expected JSON but got ${contentType || "unknown"}`);
        }

        const data = await response.json();
        const newAssets = data.data || data.assets || [];

        if (append) {
          this.allLoadedAssets = [...this.allLoadedAssets, ...newAssets];
          this.currentAssets = this.allLoadedAssets;
        } else {
          this.allLoadedAssets = newAssets;
          this.currentAssets = newAssets;
        }

        if (data.pagy) {
          this.currentPage = data.pagy.current_page || page;
          this.totalPages = data.pagy.total_pages || 1;
          this.hasMoreAssets = this.currentPage < this.totalPages;
        } else {
          this.currentPage = page;
          this.totalPages = 1;
          this.hasMoreAssets = false;
        }

        this.renderAssets(append);
        this.renderPagination();

        if (append && this.config.onLoadMore) {
          this.config.onLoadMore({
            page: this.currentPage,
            totalPages: this.totalPages,
            assetsLoaded: this.allLoadedAssets.length,
            hasMore: this.hasMoreAssets,
          });
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Playbook SDK: Failed to fetch assets -", error.message || error);
        this.showError("Failed to load assets. Please try again.");
      } finally {
        this.loading = false;
        this.abortController = null;
      }
    }

    showLoading() {
      const masonryContainer = this.container.querySelector(".pb-masonry");
      if (masonryContainer) {
        masonryContainer.innerHTML =
          '<div class="pb-loading"><div class="pb-spinner"></div></div>';
      }
    }

    showError(message) {
      const masonryContainer = this.container.querySelector(".pb-masonry");
      if (masonryContainer) {
        masonryContainer.innerHTML = `<div class="pb-error">${this.escapeHtml(
          message
        )}</div>`;
      }
    }

    getDisplayAsset(asset) {
      return asset.variant_badges?.length > 0 && asset.first_displayable_child
        ? asset.first_displayable_child
        : asset;
    }

    renderAssets(append = false) {
      const masonryContainer = this.container.querySelector(".pb-masonry");
      if (!masonryContainer) return;

      if (this.currentAssets.length === 0) {
        masonryContainer.innerHTML =
          '<div class="pb-loading" style="color: #6b7280;">No assets found</div>';
        return;
      }

      if (append) {
        const previousCount =
          masonryContainer.querySelectorAll(".pb-masonry-item").length;
        const newAssets = this.currentAssets.slice(previousCount);

        const htmlParts = [];
        newAssets.forEach((asset, idx) => {
          if (asset.collection_type === "board") return;

          const index = previousCount + idx;
          const displayAsset = this.getDisplayAsset(asset);
          const displayUrl =
            displayAsset.display_url ||
            displayAsset.thumbnail_url ||
            displayAsset.url;
          const altText = displayAsset.title || displayAsset.name || "Asset";
          const imageSrc =
            displayUrl ||
            `https://placehold.co/400x400/e5e7eb/9ca3af?text=${encodeURIComponent(
              altText
            )}`;

          htmlParts.push(`
            <div class="pb-masonry-item pb-clickable pb-asset-trigger" data-asset-index="${index}">
              <img src="${this.escapeHtml(imageSrc)}"
                   alt="${this.escapeHtml(altText)}"
                   loading="lazy"
                   onerror="this.src='https://placehold.co/400x400/e5e7eb/9ca3af?text=No+Image'">
            </div>
          `);
        });

        masonryContainer.insertAdjacentHTML("beforeend", htmlParts.join(""));
      } else {
        const htmlParts = [];
        this.currentAssets.forEach((asset, index) => {
          if (asset.collection_type === "board") return;

          const displayAsset = this.getDisplayAsset(asset);
          const displayUrl =
            displayAsset.display_url ||
            displayAsset.thumbnail_url ||
            displayAsset.url;
          const altText = displayAsset.title || displayAsset.name || "Asset";
          const imageSrc =
            displayUrl ||
            `https://placehold.co/400x400/e5e7eb/9ca3af?text=${encodeURIComponent(
              altText
            )}`;

          htmlParts.push(`
            <div class="pb-masonry-item pb-clickable pb-asset-trigger" data-asset-index="${index}">
              <img src="${this.escapeHtml(imageSrc)}"
                   alt="${this.escapeHtml(altText)}"
                   loading="lazy"
                   onerror="this.src='https://placehold.co/400x400/e5e7eb/9ca3af?text=No+Image'">
            </div>
          `);
        });

        masonryContainer.innerHTML = htmlParts.join("");
      }
    }

    async performSearch(query) {
      this.currentSearchQuery = query.trim();

      if (!this.currentSearchQuery) {
        this.clearSearch();
        return;
      }

      if (this.config.onSearch) {
        this.config.onSearch(this.currentSearchQuery);
      }

      this.currentBoardId = "all";
      this.currentPage = 1;
      this.updateBoardButtons();

      await this.fetchSearchResults(this.currentSearchQuery, 1);
    }

    async fetchSearchResults(query, page = 1) {
      if (this.loading) return;

      if (this.abortController) this.abortController.abort();
      this.abortController = new AbortController();

      this.loading = true;
      this.showLoading();

      try {
        const searchEndpoint = this.useAiSearch ? "ai_search" : "search";
        const params = new URLSearchParams({ query });
        if (!this.useAiSearch) {
          params.append("page", page.toString());
          params.append("per_page", this.perPage.toString());
        }

        const url = `${this.config.apiBaseUrl}/${searchEndpoint}?${params}`;
        const headers = { "Content-Type": "application/json" };
        if (this.config.authToken)
          headers["Authorization"] = `Bearer ${this.config.authToken}`;

        const response = await fetch(url, {
          headers,
          signal: this.abortController.signal,
        });
        if (!response.ok)
          throw new Error(`Search failed: ${response.statusText}`);

        const data = await response.json();
        this.currentAssets = data.data || [];

        if (data.pagy?.current_page) {
          this.currentPage = data.pagy.current_page || page;
          this.totalPages = data.pagy.total_pages || 1;
        } else {
          this.currentPage = data.pagy ? 1 : page;
          this.totalPages = data.pagy ? 1 : 1;
        }

        this.renderAssets();
        this.renderPagination();
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Playbook SDK: Search failed", error);
        this.showError("Search failed. Please try again.");
      } finally {
        this.loading = false;
        this.abortController = null;
      }
    }

    clearSearch() {
      this.currentSearchQuery = "";
      this.currentPage = 1;
      this.fetchAssets("", this.currentBoardId, 1);
    }

    async selectBoard(boardId, boardTitle) {
      this.currentBoardId = boardId;
      this.currentBoardTitle = boardTitle || boardId;

      const searchInput = this.container.querySelector(".pb-search-input");
      const clearButton = this.container.querySelector(".pb-clear-search");
      if (searchInput) {
        searchInput.value = "";
        clearButton?.classList.add("pb-hidden");
      }
      this.currentSearchQuery = "";

      this.updateBoardButtons();

      if (boardId === "all") {
        this.boardHierarchy = [];
        this.currentParentBoard = null;
        this.currentPage = 1;
        this.fetchBoards(this.config.boardId || null);
        const effectiveBoardId = this.config.boardId || "";
        await this.fetchAssets("", effectiveBoardId, 1);
      } else {
        const hierarchyIndex = this.boardHierarchy.findIndex(
          (b) => b.id === boardId
        );
        const isInHierarchy = hierarchyIndex !== -1;

        if (isInHierarchy) {
          this.boardHierarchy = this.boardHierarchy.slice(
            0,
            hierarchyIndex + 1
          );
        }

        this.currentPage = 1;
        await this.fetchAssets("", boardId, 1);

        this.checkAndLoadBoardChildren(boardId, boardTitle, isInHierarchy);
      }

      if (this.config.onBoardChange) {
        this.config.onBoardChange(boardId, boardTitle);
      }
    }

    async checkAndLoadBoardChildren(
      boardId,
      boardTitle,
      alreadyInHierarchy = false
    ) {
      try {
        const url = `${this.config.apiBaseUrl}/boards/${boardId}/children`;
        const headers = {
          "Content-Type": "application/json",
        };

        if (this.config.authToken) {
          headers["Authorization"] = `Bearer ${this.config.authToken}`;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) return;

        const data = await response.json();
        const children = data.data || data.boards || [];

        if (children.length > 0) {
          if (!alreadyInHierarchy) {
            this.boardHierarchy.push({
              id: boardId,
              title: boardTitle || boardId,
            });
          }
          this.currentParentBoard = { id: boardId, title: boardTitle };
          this.fetchBoards(boardId);
        }
      } catch (error) {
        console.debug("No children found for board", boardId);
      }
    }

    async goBackToParent() {
      if (this.boardHierarchy.length === 0) return;

      this.boardHierarchy.pop();

      if (this.boardHierarchy.length === 0) {
        this.currentParentBoard = null;
        this.currentBoardId = "all";
        this.currentBoardTitle = "All Assets";
        this.currentPage = 1;
        await this.fetchBoards(this.config.boardId || null);
        await this.fetchAssets("", this.config.boardId || "", 1);
      } else {
        const parent = this.boardHierarchy[this.boardHierarchy.length - 1];
        this.currentParentBoard = parent;
        this.currentBoardId = parent.id;
        this.currentBoardTitle = parent.title;
        this.currentPage = 1;
        await this.fetchBoards(parent.id);
        await this.fetchAssets("", parent.id, 1);
      }

      this.updateBoardButtons();

      if (this.config.onBoardChange) {
        this.config.onBoardChange(this.currentBoardId, this.currentBoardTitle);
      }
    }

    updateBoardButtons() {
      this.container.querySelectorAll(".pb-board-btn").forEach((btn) => {
        if (btn.dataset.boardId === this.currentBoardId) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });
    }

    openAssetModal(assetIndex) {
      if (assetIndex < 0 || assetIndex >= this.currentAssets.length) return;

      this.currentAssetIndex = assetIndex;
      const asset = this.currentAssets[assetIndex];

      if (this.config.onAssetClick) {
        this.config.onAssetClick(asset);
      }

      if (this.config.enableModal) {
        this.renderModal(asset);
        if (this.config.onModalOpen) {
          this.config.onModalOpen(asset);
        }
      }
    }

    renderModal(asset) {
      this.closeModal();

      const displayAsset = this.getDisplayAsset(asset);
      const assetUrl = displayAsset.display_url || displayAsset.url;
      const assetTitle = displayAsset.title || displayAsset.name || "Asset";
      const mediaType = displayAsset.media_type || displayAsset.type || "";

      const isVideo =
        mediaType.startsWith("video/") ||
        mediaType === "video" ||
        /\.(mp4|webm|ogg)$/i.test(assetUrl);

      const displaySrc =
        assetUrl ||
        `https://placehold.co/800x600/e5e7eb/9ca3af?text=${encodeURIComponent(
          assetTitle
        )}`;

      const assetHtml = isVideo
        ? `<video controls src="${this.escapeHtml(
            displaySrc
          )}" style="max-width: 100%; max-height: 70vh; border-radius: 8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"></video><div style="display:none; text-align:center; padding:2rem; color:#9ca3af;">Video unavailable</div>`
        : `<img src="${this.escapeHtml(displaySrc)}" alt="${this.escapeHtml(
            assetTitle
          )}" style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px;" onerror="this.src='https://placehold.co/800x600/e5e7eb/9ca3af?text=No+Image'">`;

      const modalHtml = `
        <div class="pb-modal-overlay">
          <div class="pb-modal-content">
            <button class="pb-modal-close" aria-label="Close modal">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
            
            <div class="pb-modal-body">
              <div class="pb-modal-asset">
                ${assetHtml}
              </div>
            </div>

            ${
              this.currentAssets.length > 1
                ? `
              <button class="pb-modal-nav left" aria-label="Previous asset">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
              </button>
              <button class="pb-modal-nav right" aria-label="Next asset">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </button>
            `
                : ""
            }

            ${
              this.config.enableDownload || this.config.enableInfo
                ? `
              <div class="pb-modal-actions">
                ${
                  this.config.enableInfo
                    ? `
                  <button class="pb-btn pb-info-btn" aria-label="Asset info">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span>Info</span>
                  </button>
                `
                    : ""
                }
                ${
                  this.config.enableDownload
                    ? `
                  <button class="pb-btn pb-download-btn" aria-label="Download asset">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    <span>Download</span>
                  </button>
                `
                    : ""
                }
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      document.body.style.overflow = "hidden";
      this.modalOpen = true;

      const modal = document.querySelector(".pb-modal-overlay");
      const closeBtn = modal.querySelector(".pb-modal-close");
      const leftArrow = modal.querySelector(".pb-modal-nav.left");
      const rightArrow = modal.querySelector(".pb-modal-nav.right");
      const downloadBtn = modal.querySelector(".pb-download-btn");
      const infoBtn = modal.querySelector(".pb-info-btn");

      closeBtn?.addEventListener("click", () => this.closeModal());
      modal.addEventListener("click", (e) => {
        if (e.target === modal) this.closeModal();
      });

      leftArrow?.addEventListener("click", () => this.navigateAsset(-1));
      rightArrow?.addEventListener("click", () => this.navigateAsset(1));

      downloadBtn?.addEventListener("click", () => this.downloadAsset(asset));
      infoBtn?.addEventListener("click", () => this.showAssetInfo(asset));

      document.addEventListener("keydown", this.handleKeyboardNav);
    }

    navigateAsset = (direction) => {
      let newIndex = this.currentAssetIndex + direction;

      if (newIndex < 0) {
        newIndex = this.currentAssets.length - 1;
      } else if (newIndex >= this.currentAssets.length) {
        newIndex = 0;
      }

      this.currentAssetIndex = newIndex;
      const asset = this.currentAssets[newIndex];
      this.renderModal(asset);
    };

    handleKeyboardNav = (e) => {
      if (!this.modalOpen) return;

      switch (e.key) {
        case "Escape":
          this.closeModal();
          break;
        case "ArrowLeft":
          this.navigateAsset(-1);
          break;
        case "ArrowRight":
          this.navigateAsset(1);
          break;
      }
    };

    downloadAsset(asset) {
      if (this.config.onDownload) this.config.onDownload(asset);

      const displayAsset = this.getDisplayAsset(asset);
      const assetUrl = displayAsset.display_url || displayAsset.url;
      const assetTitle = displayAsset.title || displayAsset.name || "download";

      const link = document.createElement("a");
      link.href = assetUrl;
      link.download = assetTitle;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    showAssetInfo(asset) {
      const displayAsset = this.getDisplayAsset(asset);
      const assetTitle = displayAsset.title || displayAsset.name || "Asset";
      const mediaType =
        displayAsset.media_type || displayAsset.type || "unknown";
      const assetId = displayAsset.token || displayAsset.id || "N/A";

      alert(`Asset: ${assetTitle}\nType: ${mediaType}\nID: ${assetId}`);
    }

    closeModal() {
      const modal = document.querySelector(".pb-modal-overlay");
      if (modal) {
        modal.remove();
      }
      document.body.style.overflow = "";
      this.modalOpen = false;
      document.removeEventListener("keydown", this.handleKeyboardNav);

      if (this.config.onModalClose) {
        this.config.onModalClose();
      }
    }

    escapeHtml(text) {
      // Quote-aware so values are safe in both text and quoted-attribute
      // contexts (prevents attribute breakout, e.g. board titles containing ").
      return (text == null ? "" : String(text))
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    refresh() {
      this.fetchAssets(
        this.currentSearchQuery,
        this.currentBoardId,
        this.currentPage
      );
    }

    search(query) {
      const searchInput = this.container.querySelector(".pb-search-input");
      if (searchInput) {
        searchInput.value = query;
      }
      this.performSearch(query);
    }

    selectBoardById(boardId) {
      this.selectBoard(boardId);
    }

    getAssets() {
      return this.currentAssets;
    }

    hasMore() {
      return this.hasMoreAssets;
    }

    async loadMore() {
      if (!this.hasMoreAssets || this.loading) {
        return false;
      }

      const nextPage = this.currentPage + 1;
      await this.fetchAssets(
        this.currentSearchQuery,
        this.currentBoardId,
        nextPage,
        true
      );

      return this.hasMoreAssets;
    }

    destroy() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      this.eventListeners.forEach(({ el, evt, fn }) =>
        el.removeEventListener(evt, fn)
      );
      this.eventListeners = [];
      this.closeModal();
      this.container.innerHTML = "";
      this.container.classList.remove("pb-container");
    }
  }

  return PlaybookSDK;
});
