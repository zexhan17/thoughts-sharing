import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DiaryNode, NodesMap } from "./types";
import { ConfirmDialog } from "./ConfirmDialog";
import { MarkdownText } from "./MarkdownText";

export function firstLine(content: string): string {
  const line = content.split("\n")[0].trim();
  return line.length > 60 ? line.slice(0, 59) + "…" : line;
}

const CHILD_ORDER_KEY = "diary-child-order";
const NODE_COLORS_KEY = "diary-node-colors";
const COL = 20;
const MID = 14;
const LX = 9;

const NODE_COLORS = [
  { id: "red", hex: "#f87171", tint: "rgba(248,113,113,0.13)" },
  { id: "orange", hex: "#fb923c", tint: "rgba(251,146,60,0.13)" },
  { id: "yellow", hex: "#facc15", tint: "rgba(250,204,21,0.13)" },
  { id: "green", hex: "#4ade80", tint: "rgba(74,222,128,0.13)" },
  { id: "teal", hex: "#2dd4bf", tint: "rgba(45,212,191,0.13)" },
  { id: "blue", hex: "#60a5fa", tint: "rgba(96,165,250,0.13)" },
  { id: "purple", hex: "#a78bfa", tint: "rgba(167,139,250,0.13)" },
  { id: "pink", hex: "#f472b6", tint: "rgba(244,114,182,0.13)" },
];

function loadChildOrders(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CHILD_ORDER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveChildOrders(orders: Record<string, string[]>) {
  localStorage.setItem(CHILD_ORDER_KEY, JSON.stringify(orders));
}

function loadNodeColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NODE_COLORS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveNodeColors(colors: Record<string, string>) {
  localStorage.setItem(NODE_COLORS_KEY, JSON.stringify(colors));
}

function getSortedChildren(parentId: string, nodes: NodesMap, childOrders: Record<string, string[]>): DiaryNode[] {
  const all = Object.values(nodes).filter((n) => n.parentId === parentId);
  const order = childOrders[parentId] ?? [];
  const ordered = order.map((id) => all.find((n) => n.id === id)).filter(Boolean) as DiaryNode[];
  const unseen = all.filter((n) => !order.includes(n.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...ordered, ...unseen];
}

// Context for expand/collapse all signal
interface ExpandCtx {
  collapsedIds: Set<string>;
  toggle: (id: string) => void;
}
const ExpandContext = createContext<ExpandCtx>({ collapsedIds: new Set(), toggle: () => { } });

function getAllNodeIds(nodeId: string, nodes: NodesMap): string[] {
  const result: string[] = [nodeId];
  const children = Object.values(nodes).filter((n) => n.parentId === nodeId);
  for (const child of children) result.push(...getAllNodeIds(child.id, nodes));
  return result;
}

function isEffectivelyHidden(nodeId: string, nodes: NodesMap, hiddenIds: Set<string>): boolean {
  let curId: string | null = nodeId;
  while (curId) {
    if (hiddenIds.has(curId)) return true;
    const cur: DiaryNode | undefined = nodes[curId];
    if (!cur) break;
    curId = cur.parentId;
  }
  return false;
}

interface HideCtx {
  hiddenIds: Set<string>;
  toggleHidden: (id: string) => void;
}
const HideContext = createContext<HideCtx>({ hiddenIds: new Set(), toggleHidden: () => { } });

interface DragState {
  draggedId: string | null;
  dragParentId: string | null;
  dragOverId: string | null;
}

interface NodeProps {
  node: DiaryNode;
  nodes: NodesMap;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  editingId: string | null;
  highlightId: string | null;
  childOrders: Record<string, string[]>;
  nodeColors: Record<string, string>;
  drag: DragState;
  onEdit: (id: string) => void;
  onSave: (id: string, content: string) => void;
  onAutoSave: (id: string, content: string) => void;
  onCancel: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onMove?: (id: string) => void;
  onNodeColorChange: (nodeId: string, color: string | null) => void;
  onDragStart: (id: string, parentId: string | null) => void;
  onDragOver: (e: React.DragEvent, id: string, parentId: string | null) => void;
  onDrop: (targetId: string, parentId: string | null) => void;
  onDragEnd: () => void;
  onTouchDragStart: (id: string, parentId: string | null) => void;
  onTouchDragOver: (targetId: string, parentId: string | null) => void;
  onTouchDrop: () => void;
}

function NoteNode({
  node, nodes, depth, isLast, parentLines,
  editingId, highlightId, childOrders, nodeColors, drag,
  onEdit, onSave, onAutoSave, onCancel, onAddChild, onDelete, onMove, onNodeColorChange,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onTouchDragStart, onTouchDragOver, onTouchDrop,
}: NodeProps) {
  const { collapsedIds, toggle } = useContext(ExpandContext);
  const expanded = !collapsedIds.has(node.id);
  const { hiddenIds, toggleHidden } = useContext(HideContext);
  const isDirectlyHidden = hiddenIds.has(node.id);
  const isHidden = isEffectivelyHidden(node.id, nodes, hiddenIds);

  const [draft, setDraft] = useState(node.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobileMenuPos, setMobileMenuPos] = useState({ top: 0, left: 0 });
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = editingId === node.id;
  const isHighlighted = highlightId === node.id;
  const nodeColor = NODE_COLORS.find((c) => c.id === nodeColors[node.id]);

  useEffect(() => {
    if (!isHighlighted) return;
    setTimeout(() => rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [isHighlighted]);

  const children = getSortedChildren(node.id, nodes, childOrders);
  const hasChildren = children.length > 0;

  const isDragging = drag.draggedId === node.id;
  const isDragOver = drag.dragOverId === node.id && drag.dragParentId === node.parentId && drag.draggedId !== node.id;

  const rowStyle: React.CSSProperties = {};
  if (hasChildren) { rowStyle.top = depth * 30; rowStyle.zIndex = Math.max(1, 10 - depth); }
  if (nodeColor && !isHighlighted && !isDragOver) {
    rowStyle.backgroundImage = `linear-gradient(${nodeColor.tint}, ${nodeColor.tint})`;
  }

  useEffect(() => {
    if (isEditing) {
      setDraft(node.content);
      setTimeout(() => {
        areaRef.current?.focus();
        const len = areaRef.current?.value.length ?? 0;
        areaRef.current?.setSelectionRange(len, len);
      }, 0);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isEditing && areaRef.current) {
      areaRef.current.style.height = "auto";
      areaRef.current.style.height = `${areaRef.current.scrollHeight}px`;
    }
  }, [draft, isEditing]);

  function scheduleSave(value: string) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (value.trim()) onAutoSave(node.id, value.trim());
    }, 1000);
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    scheduleSave(e.target.value);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      e.preventDefault();
      onSave(node.id, draft);
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (isEditing) return;
    e.stopPropagation();
    onTouchDragStart(node.id, node.parentId);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!drag.draggedId) return;
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const row = el.closest("[data-node-id]") as HTMLElement | null;
    if (!row) return;
    const targetId = row.dataset.nodeId!;
    const targetParentId = row.dataset.parentId ?? null;
    onTouchDragOver(targetId, targetParentId === "null" ? null : targetParentId);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!drag.draggedId) return;
    e.stopPropagation();
    onTouchDrop();
  }

  return (
    <div>
      <div
        ref={rowRef}
        data-node-id={node.id}
        data-parent-id={node.parentId ?? "null"}
        className={`flex items-start group relative transition-colors ${isDragging ? "opacity-40" : ""} ${isDragOver ? "rounded-md ring-1 ring-violet-400 dark:ring-violet-500 bg-violet-50/50 dark:bg-violet-900/20" : ""
          } ${isHighlighted ? "rounded-lg ring-2 ring-yellow-400 dark:ring-yellow-500 bg-yellow-50 dark:bg-yellow-900/25" : ""
          } ${hasChildren ? "sticky bg-white dark:bg-gray-950" : ""} ${nodeColor && !isHighlighted && !isDragOver ? "rounded-md" : ""}`}
        style={rowStyle}
        draggable={!isEditing}
        onDragStart={(e) => { e.stopPropagation(); onDragStart(node.id, node.parentId); }}
        onDragOver={(e) => { e.stopPropagation(); onDragOver(e, node.id, node.parentId); }}
        onDrop={(e) => { e.stopPropagation(); onDrop(node.id, node.parentId); }}
        onDragEnd={(e) => { e.stopPropagation(); onDragEnd(); }}
      >
        {/* Ancestor vertical lines */}
        {parentLines.map((show, i) => (
          <div key={i} className="shrink-0 relative self-stretch" style={{ width: COL }}>
            {show && <div className="absolute w-px bg-gray-200 dark:bg-gray-700" style={{ left: LX, top: 0, bottom: 0 }} />}
          </div>
        ))}

        {/* Branch connector */}
        {depth > 0 && (
          <div className="shrink-0 relative self-stretch" style={{ width: COL }}>
            <div className="absolute w-px bg-gray-200 dark:bg-gray-700" style={{ left: LX, top: 0, height: isLast ? MID : "100%" }} />
            <div className="absolute h-px bg-gray-200 dark:bg-gray-700" style={{ left: LX, top: MID, right: 0 }} />
          </div>
        )}

        {/* Expand / collapse toggle */}
        <button
          onClick={() => hasChildren && toggle(node.id)}
          className={["shrink-0 flex items-center justify-center rounded mr-0.5 w-5 h-7",
            hasChildren ? "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer" : "cursor-default",
          ].join(" ")}
        >
          {hasChildren && (
            <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>

        {/* Note content */}
        <div className="flex-1 min-w-0 py-0.5">
          {isEditing && !isHidden ? (
            <div className="pr-2 pb-1">
              <textarea
                ref={areaRef}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleKey}
                onBlur={() => onSave(node.id, draft)}
                placeholder="Write your note…"
                rows={2}
                className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-violet-300 dark:border-violet-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 leading-relaxed overflow-hidden"
              />
            </div>
          ) : (
            <button onClick={() => !isHidden && onEdit(node.id)}
              className={`w-full text-left px-2 py-1 rounded-md text-sm leading-relaxed text-gray-800 dark:text-gray-200 transition-colors ${isHidden ? "cursor-default" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
              {isHidden
                ? <span className="text-gray-400 dark:text-gray-600 select-none tracking-widest">••••••••••</span>
                : node.content
                  ? <MarkdownText content={node.content} />
                  : <span className="italic text-gray-300 dark:text-gray-600">Empty note</span>
              }
            </button>
          )}
        </div>

        {/* Actions */}
        {!isEditing && (
          <>
            {/* Desktop: icon buttons revealed on hover */}
            <div className={`hidden sm:flex items-center gap-0.5 transition-opacity self-start mt-0.5 ${isDirectlyHidden ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              {(!isHidden || isDirectlyHidden) && (
                <button onClick={() => toggleHidden(node.id)} title={isDirectlyHidden ? "Show content" : "Hide content"}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${isDirectlyHidden ? "text-violet-500 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/30" : "text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30"}`}>
                  {isDirectlyHidden ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              )}
              <button onClick={() => onAddChild(node.id)} title="Add child"
                className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const w = 252;
                  const left = Math.max(4, Math.min(rect.left - 80, window.innerWidth - w - 4));
                  setPickerPos({ top: rect.bottom + 4, left });
                  setShowColorPicker((s) => !s);
                }}
                title="Color"
                className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                style={{ color: nodeColor ? nodeColor.hex : undefined }}
              >
                <svg className={`w-3 h-3 ${nodeColor ? "" : "text-gray-400 dark:text-gray-500"}`} fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM3 8a1 1 0 1 1 2 0A1 1 0 0 1 3 8zm2-3.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm3-2a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm3 2a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm1 3.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                </svg>
              </button>
              {depth > 0 && onMove && (
                <button onClick={() => onMove(node.id)} title="Move"
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </button>
              )}
              {depth > 0 && (
                <button onClick={() => setShowDeleteDialog(true)} title="Delete"
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
              {depth > 0 && (
                <span className="w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 touch-none"
                  onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8-16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></svg>
                </span>
              )}
            </div>

            {/* Mobile: ⋯ button + drag handle */}
            <div className="flex sm:hidden items-center gap-0.5 self-start mt-0.5">
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const menuW = 160;
                  const left = Math.max(4, Math.min(rect.left - menuW + rect.width, window.innerWidth - menuW - 4));
                  setMobileMenuPos({ top: rect.bottom + 4, left });
                  setShowMobileMenu((s) => !s);
                }}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-base leading-none"
              >
                ···
              </button>
              {depth > 0 && (
                <span className="w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 touch-none"
                  onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8-16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></svg>
                </span>
              )}
            </div>
          </>
        )}

        {/* Dialogs / popovers */}
        {showDeleteDialog && (
          <ConfirmDialog message="Delete this note?" onConfirm={() => onDelete(node.id)} onCancel={() => setShowDeleteDialog(false)} />
        )}
        {showColorPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(false)} />
            <div
              className="fixed z-50 flex items-center gap-1.5 p-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 flex-wrap"
              style={{ top: pickerPos.top, left: pickerPos.left, maxWidth: "calc(100vw - 8px)" }}
            >
              {NODE_COLORS.map((c) => (
                <button key={c.id} onClick={() => { onNodeColorChange(node.id, c.id); setShowColorPicker(false); }}
                  className="w-5 h-5 rounded-full shrink-0 transition-transform hover:scale-110"
                  style={{ background: c.tint, outline: nodeColors[node.id] === c.id ? `2px solid ${c.hex}` : "none", outlineOffset: "2px", border: `1.5px solid ${c.hex}` }}
                />
              ))}
              <button onClick={() => { onNodeColorChange(node.id, null); setShowColorPicker(false); }}
                className="w-5 h-5 rounded-full border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors shrink-0">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </>
        )}
        {showMobileMenu && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setShowMobileMenu(false)} />
            <div
              className="fixed z-[9999] bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              style={{ top: mobileMenuPos.top, left: mobileMenuPos.left, minWidth: 160 }}
            >
              <button onClick={() => { onAddChild(node.id); setShowMobileMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add child
              </button>
              {(!isHidden || isDirectlyHidden) && (
                <button onClick={() => { toggleHidden(node.id); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  {isDirectlyHidden ? (
                    <svg className="w-4 h-4 text-violet-500 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                  {isDirectlyHidden ? "Show" : "Hide"}
                </button>
              )}
              <button onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const w = 252;
                const left = Math.max(4, Math.min(rect.left - 80, window.innerWidth - w - 4));
                setPickerPos({ top: rect.bottom + 4, left });
                setShowMobileMenu(false);
                setShowColorPicker(true);
              }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16" style={{ color: nodeColor ? nodeColor.hex : "#9ca3af" }}>
                  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM3 8a1 1 0 1 1 2 0A1 1 0 0 1 3 8zm2-3.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm3-2a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm3 2a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm1 3.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                </svg>
                Color
              </button>
              {depth > 0 && onMove && (
                <button onClick={() => { onMove(node.id); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                  Move
                </button>
              )}
              {depth > 0 && (
                <button onClick={() => { setShowMobileMenu(false); setShowDeleteDialog(true); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              )}
            </div>
          </>,
          document.body
        )}
      </div>

      {/* Recursive children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child, idx) => (
            <NoteNode key={child.id} node={child} nodes={nodes} depth={depth + 1}
              isLast={idx === children.length - 1} parentLines={[...parentLines, !isLast]}
              editingId={editingId} highlightId={highlightId} childOrders={childOrders} nodeColors={nodeColors} drag={drag}
              onEdit={onEdit} onSave={onSave} onAutoSave={onAutoSave} onCancel={onCancel} onAddChild={onAddChild} onDelete={onDelete} onMove={onMove} onNodeColorChange={onNodeColorChange}
              onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
              onTouchDragStart={onTouchDragStart} onTouchDragOver={onTouchDragOver} onTouchDrop={onTouchDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface NoteTreeProps {
  rootId: string;
  nodes: NodesMap;
  initialEditId: string | null;
  collapseSignal: number;
  expandSignal: number;
  scrollToId?: string | null;
  onUpdate: (id: string, content: string) => void;
  onCreateChild: (parentId: string) => string;
  onDelete: (id: string) => void;
  onMove?: (nodeId: string) => void;
}

export function NoteTree({ rootId, nodes, initialEditId, collapseSignal, expandSignal, scrollToId, onUpdate, onCreateChild, onDelete, onMove }: NoteTreeProps) {
  const [editingId, setEditingId] = useState<string | null>(initialEditId);
  const [childOrders, setChildOrders] = useState<Record<string, string[]>>({});
  const [nodeColors, setNodeColors] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<DragState>({ draggedId: null, dragParentId: null, dragOverId: null });
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => { setChildOrders(loadChildOrders()); }, []);
  useEffect(() => { setNodeColors(loadNodeColors()); }, []);

  useEffect(() => {
    setChildOrders((prev) => {
      const next = { ...prev };
      for (const parentId of Object.keys(next)) {
        const childIds = Object.values(nodes).filter((n) => n.parentId === parentId).map((n) => n.id);
        const filtered = next[parentId].filter((id) => childIds.includes(id));
        const unseen = childIds.filter((id) => !filtered.includes(id));
        next[parentId] = [...filtered, ...unseen];
      }
      saveChildOrders(next);
      return next;
    });
  }, [nodes]);

  useEffect(() => {
    if (initialEditId !== null) setEditingId(initialEditId);
  }, [initialEditId]);

  // Collapse/expand all signals
  useEffect(() => {
    if (!collapseSignal) return;
    const parentIds = new Set(Object.values(nodes).filter((n) => n.parentId !== null).map((n) => n.parentId!));
    setCollapsedIds(parentIds);
  }, [collapseSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expandSignal) return;
    setCollapsedIds(new Set());
  }, [expandSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll-to + highlight
  useEffect(() => {
    if (!scrollToId) return;
    // Expand all ancestors so the node is visible
    const toExpand = new Set<string>();
    let cur = nodes[scrollToId];
    while (cur?.parentId) { toExpand.add(cur.parentId); cur = nodes[cur.parentId]; }
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      toExpand.forEach((id) => next.delete(id));
      return next;
    });
    setHighlightId(scrollToId);
  }, [scrollToId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightId]);

  const root = nodes[rootId];
  if (!root) return null;

  function handleSave(id: string, content: string) {
    if (!content.trim()) { handleCancel(id); return; }
    onUpdate(id, content.trim());
    setEditingId(null);
  }

  function handleAutoSave(id: string, content: string) {
    if (!content.trim()) return;
    onUpdate(id, content.trim());
  }

  function handleNodeColorChange(nodeId: string, color: string | null) {
    setNodeColors((prev) => {
      const next = { ...prev };
      if (color) next[nodeId] = color; else delete next[nodeId];
      saveNodeColors(next);
      return next;
    });
  }

  function handleCancel(id: string) {
    const node = nodes[id];
    if (node && !node.content.trim()) onDelete(id);
    setEditingId(null);
  }

  function handleAddChild(parentId: string) {
    const newId = onCreateChild(parentId);
    setEditingId(newId);
  }

  function reorder(draggedId: string, targetId: string, parentId: string | null) {
    setChildOrders((prev) => {
      const siblings = getSortedChildren(parentId ?? rootId, nodes, prev).map((n) => n.id);
      const list = siblings.includes(draggedId) ? siblings : [...siblings, draggedId];
      const from = list.indexOf(draggedId);
      const to = list.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...list];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      const updated = { ...prev, [parentId ?? rootId]: next };
      saveChildOrders(updated);
      return updated;
    });
  }

  function handleDragStart(id: string, parentId: string | null) { setDrag({ draggedId: id, dragParentId: parentId, dragOverId: null }); }
  function handleDragOver(e: React.DragEvent, id: string, parentId: string | null) {
    e.preventDefault();
    if (id !== drag.draggedId && parentId === drag.dragParentId) setDrag((d) => ({ ...d, dragOverId: id }));
  }
  function handleDrop(targetId: string, parentId: string | null) {
    const { draggedId, dragParentId } = drag;
    if (!draggedId || draggedId === targetId || parentId !== dragParentId) return;
    reorder(draggedId, targetId, parentId);
    setDrag({ draggedId: null, dragParentId: null, dragOverId: null });
  }
  function handleDragEnd() { setDrag({ draggedId: null, dragParentId: null, dragOverId: null }); }
  function handleTouchDragStart(id: string, parentId: string | null) { setDrag({ draggedId: id, dragParentId: parentId, dragOverId: null }); }
  function handleTouchDragOver(targetId: string, parentId: string | null) {
    if (targetId !== drag.draggedId && parentId === drag.dragParentId) setDrag((d) => ({ ...d, dragOverId: targetId }));
  }
  function handleTouchDrop() {
    const { draggedId, dragOverId, dragParentId } = drag;
    if (draggedId && dragOverId && draggedId !== dragOverId) reorder(draggedId, dragOverId, dragParentId);
    setDrag({ draggedId: null, dragParentId: null, dragOverId: null });
  }

  function toggleHidden(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Keep direct children hidden so "show parent" only reveals that node
        Object.values(nodes).filter((n) => n.parentId === id).forEach((child) => next.add(child.id));
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const allNodeIds = getAllNodeIds(rootId, nodes);
  const anyHidden = allNodeIds.some((id) => hiddenIds.has(id));

  function toggleAllHidden() {
    if (anyHidden) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        allNodeIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setHiddenIds((prev) => new Set([...prev, ...allNodeIds]));
    }
  }

  const expandCtx: ExpandCtx = {
    collapsedIds,
    toggle: (id) => setCollapsedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
  };

  const hideCtx: HideCtx = { hiddenIds, toggleHidden };

  return (
    <HideContext.Provider value={hideCtx}>
      <ExpandContext.Provider value={expandCtx}>
        <div className="h-full overflow-y-auto">
          <div className="p-5 sm:p-8 max-w-2xl mb-120">
            <div className="flex justify-end mb-2">
              <button
                onClick={toggleAllHidden}
                title={anyHidden ? "Show all content" : "Hide all content"}
                className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {anyHidden ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
                <span>{anyHidden ? "Show all" : "Hide all"}</span>
              </button>
            </div>
            <NoteNode node={root} nodes={nodes} depth={0} isLast={true} parentLines={[]}
              editingId={editingId} highlightId={highlightId} childOrders={childOrders} nodeColors={nodeColors} drag={drag}
              onEdit={setEditingId} onSave={handleSave} onAutoSave={handleAutoSave} onCancel={handleCancel} onAddChild={handleAddChild} onDelete={onDelete} onMove={onMove} onNodeColorChange={handleNodeColorChange}
              onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={handleDragEnd}
              onTouchDragStart={handleTouchDragStart} onTouchDragOver={handleTouchDragOver} onTouchDrop={handleTouchDrop}
            />
          </div>
        </div>
      </ExpandContext.Provider>
    </HideContext.Provider>
  );
}
