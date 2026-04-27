import { useEffect, useRef, useState } from "react";
import type { DiaryNode, NodesMap } from "./types";

export function firstLine(content: string): string {
  const line = content.split("\n")[0].trim();
  return line.length > 60 ? line.slice(0, 59) + "…" : line;
}

interface NodeProps {
  node: DiaryNode;
  nodes: NodesMap;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  editingId: string | null;
  onEdit: (id: string) => void;
  onSave: (id: string, content: string) => void;
  onCancel: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}

function NoteNode({
  node, nodes, depth, isLast, parentLines,
  editingId, onEdit, onSave, onCancel, onAddChild, onDelete,
}: NodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState(node.content);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = editingId === node.id;

  const children = Object.values(nodes)
    .filter((n) => n.parentId === node.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const hasChildren = children.length > 0;

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

  const label = firstLine(node.content);

  return (
    <div>
      <div className="flex items-start group relative">
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

        {/* Hover actions */}
        {!isEditing && (
          <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-start mt-0.5">
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
              onClick={() => onDelete(node.id)}
              title="Delete"
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
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
              onEdit={onEdit}
              onSave={onSave}
              onCancel={onCancel}
              onAddChild={onAddChild}
              onDelete={onDelete}
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
          onEdit={setEditingId}
          onSave={handleSave}
          onCancel={handleCancel}
          onAddChild={handleAddChild}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
