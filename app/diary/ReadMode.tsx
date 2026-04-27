import { useEffect, useRef, useState } from "react";
import type { DiaryNode, NodesMap } from "./types";
import { MapView } from "./MapView";

type Filter = "all" | "unread";
type NavDir = "forward" | "backward";

interface ReadModeProps {
  nodes: DiaryNode[];     // depth-first ordered
  nodesMap: NodesMap;     // for breadcrumbs
  onMarkRead: (id: string, isRead: boolean) => void;
  onExit: () => void;
}

function getAncestors(nodeId: string, nodesMap: NodesMap): DiaryNode[] {
  const ancestors: DiaryNode[] = [];
  let current = nodesMap[nodeId];
  while (current?.parentId) {
    const parent = nodesMap[current.parentId];
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }
  return ancestors;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReadMode({ nodes, nodesMap, onMarkRead, onExit }: ReadModeProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [viewMode, setViewMode] = useState<"cards" | "map">("cards");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navDir, setNavDir] = useState<NavDir>("forward");
  const [cardKey, setCardKey] = useState(0); // triggers animation on change
  const [showList, setShowList] = useState(false);
  const [justMarked, setJustMarked] = useState(false); // checkmark flash
  const [autoAdvance, setAutoAdvance] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = filter === "unread" ? nodes.filter((n) => !n.isRead) : nodes;
  const total = filtered.length;
  const node = filtered[currentIndex] ?? null;
  const readCount = nodes.filter((n) => n.isRead).length;
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  function navigate(delta: number, dir: NavDir) {
    const next = currentIndex + delta;
    if (next < 0 || next >= total) return;
    setNavDir(dir);
    setCardKey((k) => k + 1);
    setCurrentIndex(next);
    setJustMarked(false);
  }

  function handleMarkRead() {
    if (!node) return;
    const wasUnread = !node.isRead;
    onMarkRead(node.id, wasUnread);

    if (wasUnread) {
      setJustMarked(true);
      setTimeout(() => setJustMarked(false), 1000);

      if (filter === "unread") {
        // Node disappears from list; stay at same index (becomes next)
        setNavDir("forward");
        setCardKey((k) => k + 1);
        setCurrentIndex((i) => Math.min(i, total - 2));
        return;
      }

      if (autoAdvance && currentIndex < total - 1) {
        setTimeout(() => {
          setNavDir("forward");
          setCardKey((k) => k + 1);
          setCurrentIndex((i) => i + 1);
        }, 500);
      }
    }
  }

  function switchFilter(f: Filter) {
    setFilter(f);
    setCurrentIndex(0);
    setCardKey((k) => k + 1);
    setJustMarked(false);
  }

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "l") {
        navigate(1, "forward");
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "h") {
        navigate(-1, "backward");
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleMarkRead();
      } else if (e.key === "Escape") {
        if (showList) setShowList(false);
        else onExit();
      } else if (e.key === "a") {
        setAutoAdvance((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Scroll active list item into view
  useEffect(() => {
    if (!showList || !listRef.current) return;
    const active = listRef.current.querySelector("[data-active=true]") as HTMLElement;
    active?.scrollIntoView({ block: "nearest" });
  }, [currentIndex, showList]);

  const isAllDone = filter === "unread" && total === 0;
  const isLast = currentIndex === total - 1;

  const ancestors = node ? getAncestors(node.id, nodesMap) : [];

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 dark:bg-gray-950 flex overflow-hidden">
      {/* ── Note list panel (slide-in from left) ────────────────────── */}
      {showList && (
        <aside className="w-full sm:w-72 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">All Notes</span>
            <button
              onClick={() => setShowList(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto py-1">
            {filtered.map((n, i) => (
              <button
                key={n.id}
                data-active={i === currentIndex}
                onClick={() => {
                  setNavDir(i > currentIndex ? "forward" : "backward");
                  setCardKey((k) => k + 1);
                  setCurrentIndex(i);
                  setJustMarked(false);
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors
                  ${i === currentIndex
                    ? "bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 font-medium"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
              >
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${n.isRead ? "bg-green-400" : "bg-amber-400"}`}
                />
                <span className="truncate flex-1">{n.title}</span>
                {i === currentIndex && (
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-violet-500" />
                )}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* ── Main reading area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — single row on mobile via compact elements */}
        <div className="shrink-0 flex items-center gap-1 sm:gap-0 justify-between px-3 sm:px-5 py-2.5 sm:py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          {/* Left: exit + list toggle (list only in cards mode) */}
          <div className="flex items-center gap-1 sm:gap-3">
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 p-2 sm:p-0 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 sm:hover:bg-transparent sm:dark:hover:bg-transparent"
              title="Exit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Exit</span>
            </button>

            {viewMode === "cards" && (
              <button
                onClick={() => setShowList((v) => !v)}
                title="Toggle note list"
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors
                  ${showList
                    ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                {total > 0 ? `${currentIndex + 1} / ${total}` : "List"}
              </button>
            )}
          </div>

          {/* Centre: filter tabs */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => switchFilter("all")}
              className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors
                ${filter === "all"
                  ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              All ({nodes.length})
            </button>
            <button
              onClick={() => switchFilter("unread")}
              className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors
                ${filter === "unread"
                  ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              Unread ({nodes.length - readCount})
            </button>
          </div>

          {/* Right: view toggle + auto-advance (cards mode only) */}
          <div className="flex items-center gap-1 sm:gap-2">
            {viewMode === "cards" && (
              <button
                onClick={() => setAutoAdvance((v) => !v)}
                title={`Auto-advance ${autoAdvance ? "on" : "off"}`}
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors
                  ${autoAdvance
                    ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span className="hidden sm:inline">Auto</span>
              </button>
            )}

            {/* Cards / Map toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("cards")}
                title="Card view"
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                  ${viewMode === "cards"
                    ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                onClick={() => { setViewMode("map"); setShowList(false); }}
                title="Map view"
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                  ${viewMode === "map"
                    ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="hidden sm:inline">Map</span>
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar — cards mode only */}
        {viewMode === "cards" && (
          <div className="h-1 bg-gray-100 dark:bg-gray-800 shrink-0">
            <div
              className="h-full bg-violet-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* ── Map view ──────────────────────────────────────────────── */}
        {viewMode === "map" && (
          <MapView
            nodesMap={nodesMap}
            readOrder={filtered}
            filter={filter}
            onMarkRead={onMarkRead}
          />
        )}

        {/* ── Cards content ──────────────────────────────────────────── */}
        {viewMode === "cards" && (isAllDone ? (
          /* All-done state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center anim-pop-in">
              <div className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-5 ring-4 ring-green-100 dark:ring-green-900/50">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">All caught up!</h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">
                You&apos;ve read all {readCount} note{readCount !== 1 ? "s" : ""}.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => switchFilter("all")}
                  className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 rounded-xl transition-colors"
                >
                  Review all notes
                </button>
                <button
                  onClick={onExit}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        ) : total === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400">No notes to read yet.</p>
            </div>
          </div>
        ) : node ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Prev arrow */}
            <button
              onClick={() => navigate(-1, "backward")}
              disabled={currentIndex === 0}
              className="shrink-0 w-10 sm:w-14 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-0 disabled:pointer-events-none transition-colors group"
              title="Previous (← or H)"
            >
              <span className="w-9 h-9 rounded-full flex items-center justify-center group-hover:bg-gray-100 dark:group-hover:bg-gray-800 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </span>
            </button>

            {/* Card area */}
            <div className="flex-1 overflow-y-auto py-5 sm:py-8 px-1 sm:px-2 flex flex-col items-center">
              <div className="w-full max-w-2xl">
                {/* Card */}
                <div
                  key={cardKey}
                  className={navDir === "forward" ? "anim-slide-right" : "anim-slide-left"}
                >
                  {/* Breadcrumb */}
                  {ancestors.length > 0 && (
                    <div className="flex items-center flex-wrap gap-1 text-xs text-gray-400 mb-3 px-1">
                      {ancestors.map((a, i) => (
                        <span key={a.id} className="flex items-center gap-1">
                          <span>{a.title}</span>
                          {i < ancestors.length - 1 && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Note card */}
                  <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border transition-colors duration-300
                    ${justMarked ? "border-green-300 dark:border-green-700 shadow-green-50 shadow-md" : "border-gray-100 dark:border-gray-800"}`}>
                    <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-gray-50 dark:border-gray-800">
                      <div className="flex items-start justify-between gap-3 sm:gap-4">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">{node.title}</h2>
                        {/* Read badge */}
                        <span className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all
                          ${justMarked
                            ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 scale-110"
                            : node.isRead
                              ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                              : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                          }`}>
                          {justMarked || node.isRead ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          )}
                          {justMarked ? "Marked read!" : node.isRead ? "Read" : "Unread"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{formatDate(node.createdAt)}</p>
                    </div>

                    <div className="px-4 sm:px-8 py-5 sm:py-7 min-h-32">
                      {node.content ? (
                        <p className="text-gray-700 dark:text-gray-300 leading-[1.8] whitespace-pre-wrap text-base">
                          {node.content}
                        </p>
                      ) : (
                        <p className="text-gray-300 dark:text-gray-600 italic text-sm">No content written for this note.</p>
                      )}
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="flex items-center justify-between mt-5 gap-3">
                    {/* Mark as read button */}
                    <button
                      onClick={handleMarkRead}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all
                        ${node.isRead
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
                          : "bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-200 dark:shadow-violet-900/30"
                        }`}
                    >
                      {node.isRead ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Unmark
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Mark as read {autoAdvance && !isLast && <span className="opacity-60 text-xs font-normal">→ next</span>}
                        </>
                      )}
                    </button>
                  </div>

                  {/* Dot navigation */}
                  {total <= 30 && (
                    <div className="flex items-center justify-center gap-1.5 mt-5 flex-wrap">
                      {filtered.map((n, i) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            setNavDir(i > currentIndex ? "forward" : "backward");
                            setCardKey((k) => k + 1);
                            setCurrentIndex(i);
                            setJustMarked(false);
                          }}
                          title={n.title}
                          className={`rounded-full transition-all duration-200
                            ${i === currentIndex
                              ? "w-7 h-2.5 bg-violet-500"
                              : n.isRead
                                ? "w-2.5 h-2.5 bg-green-300 hover:bg-green-400"
                                : "w-2.5 h-2.5 bg-amber-300 hover:bg-amber-400"
                            }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Next arrow */}
            <button
              onClick={() => navigate(1, "forward")}
              disabled={currentIndex === total - 1}
              className="shrink-0 w-10 sm:w-14 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-0 disabled:pointer-events-none transition-colors group"
              title="Next (→ or L)"
            >
              <span className="w-9 h-9 rounded-full flex items-center justify-center group-hover:bg-gray-100 dark:group-hover:bg-gray-800 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </button>
          </div>
        ) : null)}

        {/* Keyboard hints — desktop only, cards mode only */}
        {viewMode === "cards" && total > 0 && !isAllDone && (
          <div className="hidden sm:flex shrink-0 items-center justify-center gap-5 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70">
            {[
              { keys: ["←", "→"], label: "Navigate" },
              { keys: ["Space"], label: "Mark read" },
              { keys: ["A"], label: "Auto-advance" },
              { keys: ["Esc"], label: "Exit" },
            ].map(({ keys, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <span className="flex gap-1">
                  {keys.map((k) => (
                    <kbd
                      key={k}
                      className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
                <span>{label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
