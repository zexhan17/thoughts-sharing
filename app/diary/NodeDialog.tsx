import { useEffect, useRef, useState } from "react";
import type { DiaryNode } from "./types";

interface NodeDialogProps {
  mode: "create" | "edit";
  parentNode: DiaryNode | null;
  editingNode: DiaryNode | null;
  onSave: (title: string, content: string) => void;
  onClose: () => void;
}

export function NodeDialog({
  mode,
  parentNode,
  editingNode,
  onSave,
  onClose,
}: NodeDialogProps) {
  const [title, setTitle] = useState(editingNode?.title ?? "");
  const [content, setContent] = useState(editingNode?.content ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onSave(t, content.trim());
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const isEdit = mode === "edit";
  const heading = isEdit
    ? "Edit Note"
    : parentNode
      ? `Add note under "${parentNode.title}"`
      : "New Root Note";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-t border-x sm:border border-gray-100 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{heading}</h2>
            {!isEdit && parentNode && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-xs">
                Child of: {parentNode.title}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this thought a title..."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                placeholder-gray-300 dark:placeholder-gray-600
                text-gray-900 dark:text-gray-100
                bg-white dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your thoughts here..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                placeholder-gray-300 dark:placeholder-gray-600
                text-gray-900 dark:text-gray-100
                bg-white dark:bg-gray-800
                resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {isEdit ? "Save Changes" : "Create Note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
