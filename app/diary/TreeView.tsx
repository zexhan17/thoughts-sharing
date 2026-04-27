import { useRef, useState } from "react";
import type { DiaryNode, NodesMap } from "./types";

interface TreeNodeProps {
  node: DiaryNode;
  nodes: NodesMap;
  depth: number;
  selectedId: string | null;
  isLast: boolean;
  parentLines: boolean[];
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function TreeNode({
  node,
  nodes,
  depth,
  selectedId,
  isLast,
  parentLines,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);

  const children = Object.values(nodes)
    .filter((n) => n.parentId === node.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const hasChildren = children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="select-none">
      <div className="flex items-center group relative">
        {/* Ancestor lines */}
        {parentLines.map((showLine, i) => (
          <div key={i} className="relative shrink-0" style={{ width: 20 }}>
            {showLine && (
              <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
            )}
          </div>
        ))}

        {/* Branch line */}
        {depth > 0 && (
          <div className="relative shrink-0" style={{ width: 20 }}>
            <div
              className="absolute left-2.5 w-px bg-gray-200 dark:bg-gray-700"
              style={{ top: 0, height: isLast ? "50%" : "100%" }}
            />
            <div
              className="absolute bg-gray-200 dark:bg-gray-700"
              style={{ left: 10, top: "50%", width: 10, height: 1 }}
            />
          </div>
        )}

        {/* Expand/collapse — 44px touch target on mobile */}
        <button
          onClick={() => hasChildren && setExpanded((e) => !e)}
          className={[
            "shrink-0 flex items-center justify-center rounded mr-1",
            "w-8 h-8 sm:w-5 sm:h-5", // larger on mobile for touch
            hasChildren
              ? "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              : "cursor-default",
          ].join(" ")}
        >
          {hasChildren ? (
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
          )}
        </button>

        {/* Node button */}
        <button
          onClick={() => onSelect(node.id)}
          className={`flex-1 flex items-center gap-2 px-2 py-2 sm:py-1.5 rounded-lg text-left text-sm transition-colors min-w-0
            ${isSelected
              ? "bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-200"
              : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
            }`}
        >
          <span className="truncate font-medium">{node.title}</span>
          {hasChildren && (
            <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 ml-auto">
              {children.length}
            </span>
          )}
        </button>

        {/* Hover actions — visible on hover (desktop); on mobile these are accessible via NodeDetail */}
        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          <button
            onClick={() => onAddChild(node.id)}
            title="Add child note"
            className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={() => onEdit(node.id)}
            title="Edit note"
            className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(node.id)}
            title="Delete note"
            className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {children.map((child, idx) => (
            <TreeNode
              key={child.id}
              node={child}
              nodes={nodes}
              depth={depth + 1}
              selectedId={selectedId}
              isLast={idx === children.length - 1}
              parentLines={[...parentLines, !isLast]}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TreeViewProps {
  nodes: NodesMap;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddRoot: () => void;
  onAddChild: (parentId: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onImportRoot: (file: File) => void;
}

export function TreeView({
  nodes,
  selectedId,
  onSelect,
  onAddRoot,
  onAddChild,
  onEdit,
  onDelete,
  onImportRoot,
}: TreeViewProps) {
  const importRef = useRef<HTMLInputElement>(null);

  const roots = Object.values(nodes)
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImportRoot(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Thoughts
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => importRef.current?.click()}
              title="Import thought from file"
              className="flex items-center gap-1 px-2.5 py-2 sm:py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={onAddRoot}
              className="flex items-center gap-1 px-2.5 py-2 sm:py-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded-md transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500">No thoughts yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Tap &quot;New&quot; to start</p>
          </div>
        ) : (
          roots.map((root, idx) => (
            <TreeNode
              key={root.id}
              node={root}
              nodes={nodes}
              depth={0}
              selectedId={selectedId}
              isLast={idx === roots.length - 1}
              parentLines={[]}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
