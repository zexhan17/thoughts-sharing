import { useEffect, useRef, useState } from "react";
import type { NodesMap } from "./types";

function shortLabel(content: string): string {
  const line = content.split("\n")[0].trim();
  return line.length > 50 ? line.slice(0, 49) + "…" : line || "Untitled";
}

function breadcrumb(nodeId: string, nodes: NodesMap): string {
  const parts: string[] = [];
  let cur = nodes[nodeId]?.parentId ? nodes[nodes[nodeId].parentId!] : undefined;
  while (cur) {
    parts.unshift(shortLabel(cur.content));
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return parts.join(" › ");
}

function descendants(nodeId: string, nodes: NodesMap): Set<string> {
  const out = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const id = queue.pop()!;
    out.add(id);
    for (const n of Object.values(nodes)) {
      if (n.parentId === id) queue.push(n.id);
    }
  }
  return out;
}

interface Props {
  nodeId: string;
  nodes: NodesMap;
  onMove: (newParentId: string | null) => void;
  onClose: () => void;
}

export function MoveDialog({ nodeId, nodes, onMove, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [activeIdx]);

  const invalid = descendants(nodeId, nodes);
  const currentParentId = nodes[nodeId]?.parentId ?? null;

  const options: Array<{ id: string | null; label: string; sub: string }> = [
    { id: null, label: "Top-level thought", sub: "Make this a root thought" },
    ...Object.values(nodes)
      .filter((n) => !invalid.has(n.id))
      .map((n) => ({
        id: n.id,
        label: shortLabel(n.content),
        sub: breadcrumb(n.id, nodes) || "Root",
      })),
  ];

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sub.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && filtered[activeIdx]) onMove(filtered[activeIdx].id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-(--card-bg) dark:bg-gray-900 rounded-2xl shadow-2xl border border-violet-200/70 dark:border-violet-800/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Move to…"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
        </div>

        {/* Options */}
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No matches</p>
          ) : (
            filtered.map((opt, idx) => {
              const isCurrent = opt.id === currentParentId;
              const isActive = idx === activeIdx;
              return (
                <button
                  key={opt.id ?? "__root__"}
                  ref={isActive ? activeRef : undefined}
                  onClick={() => onMove(opt.id)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/50 last:border-0 transition-colors ${
                    isActive ? "bg-violet-50 dark:bg-violet-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <div className={`text-sm truncate ${
                    opt.id === null
                      ? "text-violet-600 dark:text-violet-400 font-medium"
                      : "text-gray-800 dark:text-gray-200"
                  }`}>
                    {opt.label}
                    {isCurrent && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(current)</span>}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{opt.sub}</div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 text-center">
          ↑↓ navigate · Enter select · Esc cancel
        </div>
      </div>
    </div>
  );
}
