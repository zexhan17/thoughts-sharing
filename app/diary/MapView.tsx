import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiaryNode, NodesMap } from "./types";
import { firstLine } from "./NoteTree";

// ── Layout ──────────────────────────────────────────────────────────────────
const R = 28;
const LEVEL_H = 115;
const GAP = 82;

interface LayoutNode { id: string; x: number; y: number }

function buildLayout(nodesMap: NodesMap) {
  const nodes: LayoutNode[] = [];
  const edges: { from: string; to: string }[] = [];

  const kids = (id: string) =>
    Object.values(nodesMap)
      .filter((n) => n.parentId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const leaves = (id: string): number => {
    const ch = kids(id);
    return ch.length === 0 ? 1 : ch.reduce((s, c) => s + leaves(c.id), 0);
  };

  function place(id: string, cx: number, depth: number) {
    nodes.push({ id, x: cx, y: depth * LEVEL_H });
    const ch = kids(id);
    if (!ch.length) return;
    const widths = ch.map((c) => Math.max(leaves(c.id), 1) * GAP);
    const total = widths.reduce((s, w) => s + w, 0);
    let x = cx - total / 2;
    ch.forEach((child, i) => {
      edges.push({ from: id, to: child.id });
      place(child.id, x + widths[i] / 2, depth + 1);
      x += widths[i];
    });
  }

  const roots = Object.values(nodesMap)
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let xOff = 0;
  roots.forEach((root) => {
    const w = Math.max(leaves(root.id), 1) * GAP;
    place(root.id, xOff + w / 2, 0);
    xOff += w + GAP;
  });

  return { nodes, edges };
}

// ── Flat-top hexagon ────────────────────────────────────────────────────────
function hex(cx: number, cy: number, r: number) {
  const h = r * 0.866;
  return [
    [cx - r, cy], [cx - r / 2, cy - h], [cx + r / 2, cy - h],
    [cx + r, cy], [cx + r / 2, cy + h], [cx - r / 2, cy + h],
  ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function abbr(content: string): string {
  const line = firstLine(content);
  const w = line.split(/\s+/)[0] ?? "";
  return w.length > 7 ? w.slice(0, 6) + "…" : w || "…";
}

// ── Component ───────────────────────────────────────────────────────────────
interface MapViewProps {
  nodesMap: NodesMap;
  onUpdate: (id: string, content: string) => void;
  onCreateChild: (parentId: string) => string;
  onDelete: (id: string) => void;
}

export function MapView({ nodesMap, onUpdate, onCreateChild, onDelete }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelEditing, setPanelEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const drag = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const pinchDist = useRef(0);
  const moved = useRef(false);

  const { nodes: lnodes, edges } = useMemo(() => buildLayout(nodesMap), [nodesMap]);

  const posMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    lnodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [lnodes]);

  // Auto-fit on mount / tree change
  useEffect(() => {
    if (!lnodes.length || !containerRef.current) return;
    const cw = containerRef.current.clientWidth || 300;
    const ch = containerRef.current.clientHeight || 400;
    const xs = lnodes.map((n) => n.x);
    const ys = lnodes.map((n) => n.y);
    const pad = R * 2;
    const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const scale = Math.min(cw / bw, (ch * 0.8) / bh, 1.8) * 0.88;
    const cx = Math.min(...xs) + bw / 2 - pad;
    const cy = Math.min(...ys) + bh / 2 - pad;
    setTf({ x: cw / 2 - cx * scale, y: ch * 0.42 - cy * scale, scale });
  }, [lnodes]);

  // ── Mouse ────────────────────────────────────────────────────────────────
  const onMD = useCallback((e: React.MouseEvent) => {
    drag.current = true; moved.current = false;
    last.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMM = useCallback((e: React.MouseEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);
  const onMU = useCallback(() => { drag.current = false; }, []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setTf((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * (e.deltaY > 0 ? 0.9 : 1.1))) }));
  }, []);

  // ── Touch ────────────────────────────────────────────────────────────────
  const onTS = useCallback((e: React.TouchEvent) => {
    moved.current = false;
    if (e.touches.length === 1) {
      drag.current = true;
      last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      drag.current = false;
      pinchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  }, []);
  const onTM = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && drag.current) {
      const dx = e.touches[0].clientX - last.current.x;
      const dy = e.touches[0].clientY - last.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    } else if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (pinchDist.current > 0) {
        const f = d / pinchDist.current;
        setTf((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * f)) }));
        moved.current = true;
      }
      pinchDist.current = d;
    }
  }, []);
  const onTE = useCallback(() => { drag.current = false; pinchDist.current = 0; }, []);

  function handleNodeClick(id: string) {
    if (moved.current) return;
    if (selectedId === id) return;
    setSelectedId(id);
    setPanelEditing(false);
    setDraft(nodesMap[id]?.content ?? "");
  }

  function fitToScreen() {
    if (!lnodes.length || !containerRef.current) return;
    const cw = containerRef.current.clientWidth || 300;
    const ch = containerRef.current.clientHeight || 400;
    const xs = lnodes.map((n) => n.x), ys = lnodes.map((n) => n.y);
    const pad = R * 2;
    const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const scale = Math.min(cw / bw, (ch * 0.8) / bh, 1.8) * 0.88;
    const cx = Math.min(...xs) + bw / 2 - pad;
    const cy = Math.min(...ys) + bh / 2 - pad;
    setTf({ x: cw / 2 - cx * scale, y: ch * 0.42 - cy * scale, scale });
  }

  function handleSave() {
    if (!selectedId) return;
    if (draft.trim()) {
      onUpdate(selectedId, draft.trim());
      setPanelEditing(false);
    } else {
      onDelete(selectedId);
      setSelectedId(null);
      setPanelEditing(false);
    }
  }

  function handleCancelEdit() {
    if (!selectedId) return;
    const node = nodesMap[selectedId];
    if (node && !node.content.trim()) {
      onDelete(selectedId);
      setSelectedId(null);
    }
    setPanelEditing(false);
  }

  function handleAddChild() {
    if (!selectedId) return;
    const newId = onCreateChild(selectedId);
    setSelectedId(newId);
    setPanelEditing(true);
    setDraft("");
  }

  function handleDelete() {
    if (!selectedId) return;
    onDelete(selectedId);
    setSelectedId(null);
    setPanelEditing(false);
  }

  const selectedNode: DiaryNode | null = selectedId ? (nodesMap[selectedId] ?? null) : null;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden relative bg-slate-950">

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        {[
          { label: "+", action: () => setTf((t) => ({ ...t, scale: Math.min(4, t.scale * 1.25) })) },
          { label: "−", action: () => setTf((t) => ({ ...t, scale: Math.max(0.2, t.scale * 0.8) })) },
          { label: "⊡", action: fitToScreen },
        ].map(({ label, action }) => (
          <button key={label} onClick={action}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-bold transition-colors border border-slate-700">
            {label}
          </button>
        ))}
      </div>

      {/* SVG canvas */}
      <svg
        className="flex-1 w-full touch-none cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}
        onWheel={onWheel} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
      >
        <g transform={`translate(${tf.x.toFixed(1)},${tf.y.toFixed(1)}) scale(${tf.scale.toFixed(3)})`}>
          {/* Edges */}
          {edges.map((e) => {
            const f = posMap.get(e.from), t = posMap.get(e.to);
            if (!f || !t) return null;
            return (
              <line key={`${e.from}-${e.to}`}
                x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                stroke="#334155" strokeWidth={3} strokeLinecap="round" />
            );
          })}

          {/* Nodes */}
          {lnodes.map((ln) => {
            const node = nodesMap[ln.id];
            if (!node) return null;
            const isSel = selectedId === ln.id;

            const fill = isSel ? "#2e1065" : "#1e1b4b";
            const stroke = isSel ? "#a78bfa" : "#6d28d9";
            const txtFill = isSel ? "#ddd6fe" : "#a78bfa";

            return (
              <g key={ln.id} onClick={() => handleNodeClick(ln.id)} className="cursor-pointer">
                {isSel && (
                  <polygon points={hex(ln.x, ln.y, R + 7)}
                    fill="none" stroke="#a78bfa" strokeWidth={1.5} opacity={0.4} />
                )}
                <polygon points={hex(ln.x, ln.y, R)} fill={fill} stroke={stroke} strokeWidth={2.5} />
                <polygon points={hex(ln.x, ln.y - 2, R * 0.55)} fill="white" opacity={0.04} />
                <text x={ln.x} y={ln.y + 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={txtFill} fontSize={8} fontWeight="600">
                  {abbr(node.content)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hint */}
      {!selectedNode && lnodes.length > 0 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-xs text-slate-500 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
            Tap a node to read · Drag to pan · Pinch / scroll to zoom
          </span>
        </div>
      )}

      {/* Node detail panel */}
      {selectedNode && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "55%" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Header */}
          <div className="flex items-center gap-2 px-5 pb-3 pt-1 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <p className="text-xs text-gray-400 dark:text-gray-500 flex-1">
              {new Date(selectedNode.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </p>
            <div className="flex items-center gap-2">
              {!panelEditing && (
                <>
                  <button
                    onClick={() => { setPanelEditing(true); setDraft(selectedNode.content); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={handleAddChild}
                    title="Add child note"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Child
                  </button>
                  <button
                    onClick={handleDelete}
                    title="Delete note"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
              {panelEditing && (
                <>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                onClick={() => { setSelectedId(null); setPanelEditing(false); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {panelEditing ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") handleCancelEdit();
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave();
                }}
                placeholder="Write your note…"
                className="w-full h-full min-h-24 text-sm text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none leading-relaxed resize-none"
              />
            ) : (
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                {selectedNode.content || <span className="italic text-gray-400">Empty note</span>}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
