import { useEffect, useRef, useState } from "react";
import type { NodesMap } from "./types";
import { firstLine } from "./NoteTree";

interface SearchResult {
  nodeId: string;
  rootId: string;
  rootTitle: string;
  matchStart: number;
  matchLength: number;
  content: string;
}

interface Props {
  nodes: NodesMap;
  lockedRootIds: Set<string>;
  onSelect: (nodeId: string, rootId: string) => void;
  onClose: () => void;
  scopeRootId?: string;
}

function findRoot(nodeId: string, nodes: NodesMap): string {
  let cur = nodes[nodeId];
  while (cur?.parentId) cur = nodes[cur.parentId];
  return cur?.id ?? nodeId;
}

function getPreview(content: string, matchStart: number, matchLen: number) {
  const WIN = 45;
  const start = Math.max(0, matchStart - WIN);
  const end = Math.min(content.length, matchStart + matchLen + WIN);
  return {
    pre: (start > 0 ? "…" : "") + content.slice(start, matchStart),
    match: content.slice(matchStart, matchStart + matchLen),
    post: content.slice(matchStart + matchLen, end) + (end < content.length ? "…" : ""),
  };
}

export function SearchDialog({ nodes, lockedRootIds, onSelect, onClose, scopeRootId }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [activeIdx]);

  const results: SearchResult[] = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];
    for (const node of Object.values(nodes)) {
      const rootId = findRoot(node.id, nodes);
      if (scopeRootId && rootId !== scopeRootId) continue;
      if (lockedRootIds.has(rootId)) continue;
      const idx = node.content.toLowerCase().indexOf(q);
      if (idx === -1) continue;
      out.push({
        nodeId: node.id,
        rootId,
        rootTitle: firstLine(nodes[rootId]?.content || "") || "Untitled",
        content: node.content,
        matchStart: idx,
        matchLength: q.length,
      });
      if (out.length >= 50) break;
    }
    return out;
  })();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[activeIdx]) onSelect(results[activeIdx].nodeId, results[activeIdx].rootId);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-(--card-bg) dark:bg-gray-900 rounded-2xl shadow-2xl border border-violet-200/70 dark:border-violet-800/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-violet-100/70 dark:border-violet-900/30">
          <svg className="w-4 h-4 text-violet-400 dark:text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder={scopeRootId ? "Search in this thought…" : "Search across all nodes…"}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {!query.trim() ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
              {scopeRootId ? "Type to search in this thought" : "Type to search across all nodes"}
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            results.map((r, idx) => {
              const { pre, match, post } = getPreview(r.content, r.matchStart, r.matchLength);
              const isActive = idx === activeIdx;
              return (
                <button
                  key={`${r.nodeId}-${idx}`}
                  ref={isActive ? activeRef : undefined}
                  onClick={() => onSelect(r.nodeId, r.rootId)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full text-left px-4 py-3 border-b border-violet-100/50 dark:border-violet-900/20 last:border-0 transition-colors ${
                    isActive ? "bg-violet-50 dark:bg-violet-900/30" : "hover:bg-violet-50/60 dark:hover:bg-violet-900/20"
                  }`}
                >
                  <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                    {pre}
                    <mark className="bg-yellow-200 dark:bg-yellow-600/50 text-gray-900 dark:text-gray-100 rounded-sm not-italic px-0.5">
                      {match}
                    </mark>
                    {post}
                  </div>
                  {r.nodeId !== r.rootId && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h7" />
                      </svg>
                      {r.rootTitle}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-violet-100/70 dark:border-violet-900/30 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
            <span className="hidden sm:inline">↑↓ navigate · Enter select · Esc close</span>
          </div>
        )}
      </div>
    </div>
  );
}
