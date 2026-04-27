import { useRef } from "react";
import type { DiaryNode, NodesMap } from "./types";

interface NodeDetailProps {
  node: DiaryNode;
  nodes: NodesMap;
  ancestors: DiaryNode[];
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  onExport: () => void;
  onImportChild: (file: File) => void;
  onSelectNode: (id: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NodeDetail({
  node,
  nodes,
  ancestors,
  onEdit,
  onDelete,
  onAddChild,
  onExport,
  onImportChild,
  onSelectNode,
}: NodeDetailProps) {
  const importRef = useRef<HTMLInputElement>(null);

  const children = Object.values(nodes)
    .filter((n) => n.parentId === node.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImportChild(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      {ancestors.length > 0 && (
        <div className="px-4 sm:px-6 pt-4 pb-0 flex items-center flex-wrap gap-1 text-xs text-gray-400 dark:text-gray-500">
          {ancestors.map((a, i) => (
            <span key={a.id} className="flex items-center gap-1">
              <button
                onClick={() => onSelectNode(a.id)}
                className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline transition-colors"
              >
                {a.title}
              </button>
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

      {/* Title + actions — stacked on mobile, side-by-side on sm+ */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight mb-1">
              {node.title}
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(node.createdAt)}</p>
          </div>

          {/* Action buttons — icon-only on mobile, icon+text on sm+ */}
          <div className="flex items-center gap-1 flex-wrap sm:shrink-0">
            <button
              onClick={onAddChild}
              title="Add child note"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add child</span>
            </button>
            <button
              onClick={onEdit}
              title="Edit note"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={onExport}
              title="Export this thought to file"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={onDelete}
              title="Delete note"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {node.content ? (
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
            {node.content}
          </p>
        ) : (
          <p className="text-gray-300 dark:text-gray-600 text-sm italic">
            No content — tap Edit to add some.
          </p>
        )}
      </div>

      {/* Footer: child notes + import child */}
      <div className="px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
        <div className="flex items-center justify-between mb-2">
          {children.length > 0 ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {children.length} child note{children.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={() => importRef.current?.click()}
            title="Import a thought as a child of this note"
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 px-2.5 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import as child
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>

        {children.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => onSelectNode(child.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-gray-600 dark:text-gray-300 hover:text-violet-700 dark:hover:text-violet-300 rounded-lg transition-colors"
              >
                {child.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
