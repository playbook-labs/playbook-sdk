import { useState, useEffect, useRef } from "react";
import PlaybookSDK from "playbook-sdk";

const SDK_CONFIG = {
  organizationSlug: "playbook-sdk",
  // Return a short-lived token minted by your backend (not a long-lived one).
  getAccessToken: async (): Promise<string> => {
    const res = await fetch("/playbook/token");
    return (await res.json()).token;
  },
} as const;

interface Stats {
  totalAssets: number;
  lastSearch: string;
  currentBoard: string;
  assetsViewed: number;
  downloadsInitiated: number;
  searchesPerformed: number;
}

interface EventLog {
  id: number;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

function App() {
  const [stats, setStats] = useState<Stats>({
    totalAssets: 0,
    lastSearch: "None",
    currentBoard: "All media",
    assetsViewed: 0,
    downloadsInitiated: 0,
    searchesPerformed: 0,
  });
  const [events, setEvents] = useState<EventLog[]>([]);
  const [isGalleryActive, setIsGalleryActive] = useState(false);
  const [showEventLog, setShowEventLog] = useState(false);
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<ReturnType<typeof PlaybookSDK.init>>(null);

  useEffect(() => {
    if (eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events]);

  const logEvent = (message: string, type: EventLog["type"] = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const newEvent: EventLog = {
      id: Date.now(),
      timestamp,
      message,
      type,
    };
    setEvents((prev) => [...prev, newEvent]);
  };

  useEffect(() => {
    if (galleryRef.current) {
      galleryRef.current.destroy();
    }

    logEvent("Initializing Playbook SDK...", "info");

    try {
      galleryRef.current = PlaybookSDK.init({
        containerId: "playbook-gallery",
        organizationSlug: SDK_CONFIG.organizationSlug,
        getAccessToken: SDK_CONFIG.getAccessToken,
        perPage: 15,

        enableSearch: true,
        enableBoards: true,
        enableModal: true,
        enableDownload: true,
        enableInfo: true,

        columnBreakpoints: {
          default: 2,
          640: 2,
          768: 3,
          1024: 4,
          1280: 5,
          1536: 6,
          1800: 7,
        },

        onAssetClick: (asset) => {
          logEvent(`Asset clicked: "${asset.title || asset.name}"`, "info");
          setStats((prev) => ({
            ...prev,
            assetsViewed: prev.assetsViewed + 1,
          }));
        },

        onSearch: (query) => {
          logEvent(`Search: "${query || "(cleared)"}"`, "success");
          setStats((prev) => ({
            ...prev,
            lastSearch: query || "None",
            searchesPerformed: prev.searchesPerformed + 1,
          }));

          setTimeout(() => {
            if (galleryRef.current) {
              const assets = galleryRef.current.getAssets();
              setStats((prev) => ({ ...prev, totalAssets: assets.length }));
              setHasMoreAssets(galleryRef.current.hasMore());
            }
          }, 500);
        },

        onBoardChange: (boardId, boardTitle) => {
          const displayName =
            boardTitle || (boardId === "all" ? "All media" : boardId);
          logEvent(`Board changed: "${displayName}"`, "success");
          setStats((prev) => ({
            ...prev,
            currentBoard: displayName,
          }));

          setTimeout(() => {
            if (galleryRef.current) {
              const assets = galleryRef.current.getAssets();
              setStats((prev) => ({ ...prev, totalAssets: assets.length }));
              setHasMoreAssets(galleryRef.current.hasMore());
            }
          }, 500);
        },

        onModalOpen: (asset) => {
          logEvent(`Modal opened: "${asset.title || asset.name}"`, "info");
        },

        onModalClose: () => {
          logEvent("Modal closed", "info");
        },

        onDownload: (asset) => {
          logEvent(`Download: "${asset.title || asset.name}"`, "warning");
          setStats((prev) => ({
            ...prev,
            downloadsInitiated: prev.downloadsInitiated + 1,
          }));
        },

        onLoadMore: (info) => {
          logEvent(
            `Loaded more assets: ${info.assetsLoaded} total, page ${info.page}/${info.totalPages}`,
            "success"
          );
          setStats((prev) => ({ ...prev, totalAssets: info.assetsLoaded }));
          setHasMoreAssets(info.hasMore);
        },
      });

      setIsGalleryActive(true);
      logEvent("SDK initialized successfully!", "success");

      setTimeout(() => {
        if (galleryRef.current) {
          const assets = galleryRef.current.getAssets();
          setStats((prev) => ({ ...prev, totalAssets: assets.length }));
          setHasMoreAssets(galleryRef.current.hasMore());
        }
      }, 1500);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logEvent(`Initialization error: ${errorMessage}`, "error");
      console.error("Failed to initialize Playbook SDK:", error);
    }

    return () => {
      if (galleryRef.current) {
        try {
          galleryRef.current.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  const handleLoadMore = async () => {
    if (galleryRef.current) {
      await galleryRef.current.loadMore();
    }
  };

  const handleRefresh = () => {
    if (galleryRef.current) {
      galleryRef.current.refresh();
      logEvent("Gallery refreshed", "success");
      setTimeout(() => {
        if (galleryRef.current) {
          setHasMoreAssets(galleryRef.current.hasMore());
        }
      }, 500);
    }
  };

  const handleRestart = () => {
    if (galleryRef.current) {
      PlaybookSDK.destroy("playbook-gallery");
      setIsGalleryActive(false);
      setStats({
        totalAssets: 0,
        lastSearch: "None",
        currentBoard: "Restarting...",
        assetsViewed: 0,
        downloadsInitiated: 0,
        searchesPerformed: 0,
      });
      logEvent("Gallery destroyed - reloading page...", "warning");

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleClearLog = () => {
    setEvents([]);
    logEvent("Event log cleared", "info");
  };

  const getEventTypeStyles = (type: EventLog["type"]): string => {
    const styles: Record<EventLog["type"], string> = {
      info: "text-blue-600 bg-blue-50",
      success: "text-green-600 bg-green-50",
      warning: "text-orange-600 bg-orange-50",
      error: "text-red-600 bg-red-50",
    };
    return styles[type];
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'>
      {/* Header */}
      <header className='bg-black/40 backdrop-blur-lg border-b border-purple-500/20'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-4'>
              <div className='w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center'>
                <svg
                  className='w-7 h-7 text-white'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
                  />
                </svg>
              </div>
              <div>
                <h1 className='text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400'>
                  ImageAI Studio
                </h1>
                <p className='text-sm text-purple-300'>
                  Powered by Playbook Gallery SDK
                </p>
              </div>
            </div>
            <div className='flex gap-2'>
              <button
                onClick={handleRefresh}
                disabled={!isGalleryActive}
                className='px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2'
              >
                <svg
                  className='w-4 h-4'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                  />
                </svg>
                <span>Refresh</span>
              </button>
              <button
                onClick={handleRestart}
                disabled={!isGalleryActive}
                className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2'
              >
                <svg
                  className='w-4 h-4'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M6 18L18 6M6 6l12 12'
                  />
                </svg>
                <span>Restart</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        {/* Analytics Dashboard */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8'>
          {/* Total Assets */}
          <div className='bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-purple-300'>
                  Total Assets
                </p>
                <p className='text-3xl font-bold text-white mt-1'>
                  {stats.totalAssets}
                </p>
              </div>
              <div className='w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center'>
                <svg
                  className='w-6 h-6 text-purple-400'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Assets Viewed */}
          <div className='bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-blue-500/20'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-blue-300'>
                  Assets Viewed
                </p>
                <p className='text-3xl font-bold text-white mt-1'>
                  {stats.assetsViewed}
                </p>
              </div>
              <div className='w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center'>
                <svg
                  className='w-6 h-6 text-blue-400'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                  />
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Searches */}
          <div className='bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-green-500/20'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-green-300'>Searches</p>
                <p className='text-3xl font-bold text-white mt-1'>
                  {stats.searchesPerformed}
                </p>
              </div>
              <div className='w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center'>
                <svg
                  className='w-6 h-6 text-green-400'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Downloads */}
          <div className='bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-pink-500/20'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-pink-300'>Downloads</p>
                <p className='text-3xl font-bold text-white mt-1'>
                  {stats.downloadsInitiated}
                </p>
              </div>
              <div className='w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center'>
                <svg
                  className='w-6 h-6 text-pink-400'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4'
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Current Board */}
        <div className='bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20 mb-8'>
          <div className='flex items-center space-x-3'>
            <div className='w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center'>
              <svg
                className='w-6 h-6 text-white'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'
                />
              </svg>
            </div>
            <div className='flex-1'>
              <p className='text-sm text-purple-300 font-medium'>
                Current Board
              </p>
              <p className='text-lg font-semibold text-white'>
                {stats.currentBoard}
              </p>
            </div>
          </div>
        </div>

        {/* SDK Gallery Container */}
        <div className='bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20 mb-8'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-xl font-semibold text-white'>Gallery</h2>
            <div className='flex items-center space-x-2'>
              <div
                className={`w-2 h-2 rounded-full ${
                  isGalleryActive ? "bg-green-400" : "bg-red-400"
                }`}
              ></div>
              <span className='text-sm text-gray-400'>
                {isGalleryActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <div id='playbook-gallery'></div>
        </div>

        {/* Load More Button */}
        {isGalleryActive && hasMoreAssets && (
          <div className='flex justify-center mb-8'>
            <button
              onClick={handleLoadMore}
              className='px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg'
            >
              Load More
            </button>
          </div>
        )}

        {/* Event Log */}
        <div className='bg-black/40 backdrop-blur-lg rounded-xl border border-purple-500/20 overflow-hidden'>
          <div className='p-6 border-b border-purple-500/20'>
            <div className='flex items-center justify-between'>
              <h2 className='text-xl font-semibold text-white'>Event Log</h2>
              <div className='flex gap-2'>
                <button
                  onClick={() => setShowEventLog(!showEventLog)}
                  className='px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition'
                >
                  {showEventLog ? "Hide" : "Show"}
                </button>
                <button
                  onClick={handleClearLog}
                  className='px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition'
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {showEventLog && (
            <div className='p-6'>
              <div className='bg-slate-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm'>
                {events.length === 0 ? (
                  <div className='text-gray-500'>
                    Event log is empty. Interact with the gallery to see
                    events...
                  </div>
                ) : (
                  <div className='space-y-2'>
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className={`p-2 rounded ${getEventTypeStyles(
                          event.type
                        )}`}
                      >
                        <span className='font-semibold'>
                          [{event.timestamp}]
                        </span>{" "}
                        {event.message}
                      </div>
                    ))}
                    <div ref={eventsEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className='mt-16 bg-black/40 backdrop-blur-lg border-t border-purple-500/20'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center'>
          <p className='text-purple-300 text-sm'>
            Demo Application for Partner Integration • Built with React +
            TypeScript & Playbook Gallery SDK
          </p>
          <p className='text-purple-400 text-xs mt-2'>
            ImageAI Studio - AI-Generated Image Management Platform
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
