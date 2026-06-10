import { useEffect, useState } from "react";

interface ConfirmDialogProps {
  message: string;
  detail?: string;
  subtext?: string;
  confirmLabel?: string;
  showChildOption?: boolean;
  onConfirm: () => void;
  onConfirmKeepChildren?: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, detail, subtext, confirmLabel = "Delete", showChildOption, onConfirm, onConfirmKeepChildren, onCancel }: ConfirmDialogProps) {
  const [deleteChildren, setDeleteChildren] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function handleConfirm() {
    if (showChildOption && !deleteChildren && onConfirmKeepChildren) {
      onConfirmKeepChildren();
    } else {
      onConfirm();
    }
  }

  return (
    <div
      className="fixed inset-0 z-10000 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-xs border border-gray-100 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
          {message}
        </p>
        {detail && (
          <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 mb-3 line-clamp-2 italic">
            "{detail}"
          </p>
        )}
        {showChildOption ? (
          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteChildren}
              onChange={(e) => setDeleteChildren(e.target.checked)}
              className="w-4 h-4 rounded accent-red-500 cursor-pointer"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Delete it's child
            </span>
          </label>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
            {subtext ?? "This will also delete all child notes."}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
