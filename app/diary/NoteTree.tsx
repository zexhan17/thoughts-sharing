import { useEffect, useRef, useState } from "react";
import type { DiaryNode, NodesMap } from "./types";
import { ConfirmDialog } from "./ConfirmDialog";

export function firstLine(content: string): string {
  const line = content.split("\n")[0].trim();
  return line.length > 60 ? line.slice(0, 59) + "…" : line;
}

const CHILD_ORDER_KEY = "diary-child-order";

function loadChildOrders(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CHILD_ORDER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveChildOrders(orders: Record<string, string[]>) {
  localStorage.setItem(CHILD_ORDER_KEY, JSON.stringify(orders));
}

function getSortedChildren(parentId: string, nodes: NodesMap, childOrders: Record<string, string[]>): DiaryNode[] {
  const all = Object.values(nodes).filter((n) => n.parentId === parentId);
  const order = childOrders[parentId] ?? [];
  const ordered = order.map((id) => all.find((n) => n.id === id)).filter(Boolean) as DiaryNode[];
  const unseen = all
    .filter((n) => !order.includes(n.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...ordered, ...unseen];
}

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
  childOrders: Record<string, string[]>;
  drag: DragState;
  onEdit: (id: string) => void;
  onSave: (id: string, content: string) => void;
  onCancel: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
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
  editingId, childOrders, drag,
  onEdit, onSave, onCancel, onAddChild, onDelete,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onTouchDragStart, onTouchDragOver, onTouchDrop,
}: NodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState(node.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = editingId === node.id;

  const children = getSortedChildren(node.id, nodes, childOrders);
  const hasChildren = children.length > 0;

  const isDragging = drag.draggedId === node.id;
  const isDragOver = drag.dragOverId === node.id && drag.dragParentId === node.parentId && drag.draggedId !== node.id;

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

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { e.preventDefault(); onCancel(node.id); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(node.id, draft); }
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
        data-node-id={node.id}
        data-parent-id={node.parentId ?? "null"}
        className={`flex items-start group relative rounded-md transition-colors ${
          isDragging ? "opacity-40" : ""
        } ${isDragOver ? "ring-1 ring-violet-400 dark:ring-violet-500 bg-violet-50/50 dark:bg-violet-900/20" : ""}`}
        draggable={!isEditing}
        onDragStart={(e) => { e.stopPropagation(); onDragStart(node.id, node.parentId); }}
        onDragOver={(e) => { e.stopPropagation(); onDragOver(e, node.id, node.parentId); }}
        onDrop={(e) => { e.stopPropagation(); onDrop(node.id, node.parentId); }}
        onDragEnd={(e) => { e.stopPropagation(); onDragEnd(); }}
      >
        {/* Ancestor vertical lines */}
        {parentLines.map((show, i) => (
          <div key={i} className="shrink-0 relative" style={{ width: 20 }}>
            {show && <div className="absolute left-2.25 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />}
          </div>
        ))}

        {/* Branch connector */}
        {depth > 0 && (
          <div className="shrink-0 relative" style={{ width: 20 }}>
            <div className="absolute left-2.25 w-px bg-gray-200 dark:bg-gray-700"
              style={{ top: 0, height: isLast ? "1.1rem" : "100%" }} />
            <div className="absolute bg-gray-200 dark:bg-gray-700"
              style={{ left: 9, top: "1.1rem", width: 11, height: 1 }} />
          </div>
        )}

        {/* Drag handle — touch events here, mouse drag on the whole row */}
        {!isEditing && (
          <span
            className="shrink-0 flex items-center self-center cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity mr-0.5 mt-0.5 touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8-16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            </svg>
          </span>
        )}

        {/* Expand / collapse toggle */}
        <button
          onClick={() => hasChildren && setExpanded((v) => !v)}
          className={[
            "shrink-0 flex items-center justify-center rounded mr-0.5",
            "w-5 h-7",
            hasChildren
              ? "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              : "cursor-default",
          ].join(" ")}
        >
          {hasChildren ? (
            <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
          )}
        </button>

        {/* Note content — edit mode or display mode */}
        <div className="flex-1 min-w-0 py-0.5">
          {isEditing ? (
            <div className="flex flex-col gap-1.5 pr-2 pb-1">
              <textarea
                ref={areaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Write your note…"
                rows={2}
                className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-violet-300 dark:border-violet-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 leading-relaxed overflow-hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSave(node.id, draft)}
                  className="px-3 py-1 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-md transition-colors"
                >
                  Save
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onCancel(node.id)}
                  className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <span className="text-xs text-gray-300 dark:text-gray-600 hidden sm:inline">
                  Ctrl+Enter · Esc
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onEdit(node.id)}
              className="w-full text-left px-2 py-1 rounded-md text-sm leading-relaxed text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors whitespace-pre-wrap wrap-break-word"
            >
              {node.content || <span className="italic text-gray-300 dark:text-gray-600">Empty note</span>}
            </button>
          )}
        </div>

        {/* Actions — always visible on mobile, hover-only on desktop */}
        {!isEditing && (
          <div className="shrink-0 flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-start mt-0.5">
            <button
              onClick={() => onAddChild(node.id)}
              title="Add child note"
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              title="Delete"
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {showDeleteDialog && (
              <ConfirmDialog
                message="Delete this note?"
                onConfirm={() => onDelete(node.id)}
                onCancel={() => setShowDeleteDialog(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Recursive children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child, idx) => (
            <NoteNode
              key={child.id}
              node={child}
              nodes={nodes}
              depth={depth + 1}
              isLast={idx === children.length - 1}
              parentLines={[...parentLines, !isLast]}
              editingId={editingId}
              childOrders={childOrders}
              drag={drag}
              onEdit={onEdit}
              onSave={onSave}
              onCancel={onCancel}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onTouchDragStart={onTouchDragStart}
              onTouchDragOver={onTouchDragOver}
              onTouchDrop={onTouchDrop}
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
  onUpdate: (id: string, content: string) => void;
  onCreateChild: (parentId: string) => string;
  onDelete: (id: string) => void;
}

export function NoteTree({ rootId, nodes, initialEditId, onUpdate, onCreateChild, onDelete }: NoteTreeProps) {
  const [editingId, setEditingId] = useState<string | null>(initialEditId);
  const [childOrders, setChildOrders] = useState<Record<string, string[]>>({});
  const [drag, setDrag] = useState<DragState>({ draggedId: null, dragParentId: null, dragOverId: null });

  useEffect(() => {
    setChildOrders(loadChildOrders());
  }, []);

  // Sync child orders when nodes change (remove deleted, add new)
  useEffect(() => {
    setChildOrders((prev) => {
      const next = { ...prev };
      for (const parentId of Object.keys(next)) {
        const childIds = Object.values(nodes)
          .filter((n) => n.parentId === parentId)
          .map((n) => n.id);
        const filtered = next[parentId].filter((id) => childIds.includes(id));
        const unseen = childIds.filter((id) => !filtered.includes(id));
        next[parentId] = [...filtered, ...unseen];
      }
      saveChildOrders(next);
      return next;
    });
  }, [nodes]);

  // Sync when the parent signals a new node should be in edit mode
  useEffect(() => {
    if (initialEditId !== null) setEditingId(initialEditId);
  }, [initialEditId]);

  const root = nodes[rootId];
  if (!root) return null;

  function handleSave(id: string, content: string) {
    if (!content.trim()) {
      handleCancel(id);
      return;
    }
    onUpdate(id, content.trim());
    setEditingId(null);
  }

  function handleCancel(id: string) {
    const node = nodes[id];
    if (node && !node.content.trim()) {
      onDelete(id);
    }
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
      const key = parentId ?? rootId;
      const updated = { ...prev, [key]: next };
      saveChildOrders(updated);
      return updated;
    });
  }

  function handleDragStart(id: string, parentId: string | null) {
    setDrag({ draggedId: id, dragParentId: parentId, dragOverId: null });
  }

  function handleDragOver(e: React.DragEvent, id: string, parentId: string | null) {
    e.preventDefault();
    if (id !== drag.draggedId && parentId === drag.dragParentId) {
      setDrag((d) => ({ ...d, dragOverId: id }));
    }
  }

  function handleDrop(targetId: string, parentId: string | null) {
    const { draggedId, dragParentId } = drag;
    if (!draggedId || draggedId === targetId || parentId !== dragParentId) return;
    reorder(draggedId, targetId, parentId);
    setDrag({ draggedId: null, dragParentId: null, dragOverId: null });
  }

  function handleDragEnd() {
    setDrag({ draggedId: null, dragParentId: null, dragOverId: null });
  }

  // Touch drag handlers
  function handleTouchDragStart(id: string, parentId: string | null) {
    setDrag({ draggedId: id, dragParentId: parentId, dragOverId: null });
  }

  function handleTouchDragOver(targetId: string, parentId: string | null) {
    if (targetId !== drag.draggedId && parentId === drag.dragParentId) {
      setDrag((d) => ({ ...d, dragOverId: targetId }));
    }
  }

  function handleTouchDrop() {
    const { draggedId, dragOverId, dragParentId } = drag;
    if (draggedId && dragOverId && draggedId !== dragOverId) {
      reorder(draggedId, dragOverId, dragParentId);
    }
    setDrag({ draggedId: null, dragParentId: null, dragOverId: null });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 sm:p-8 max-w-2xl">
        <NoteNode
          node={root}
          nodes={nodes}
          depth={0}
          isLast={true}
          parentLines={[]}
          editingId={editingId}
          childOrders={childOrders}
          drag={drag}
          onEdit={setEditingId}
          onSave={handleSave}
          onCancel={handleCancel}
          onAddChild={handleAddChild}
          onDelete={onDelete}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onTouchDragStart={handleTouchDragStart}
          onTouchDragOver={handleTouchDragOver}
          onTouchDrop={handleTouchDrop}
        />
      </div>
    </div>
  );
}
