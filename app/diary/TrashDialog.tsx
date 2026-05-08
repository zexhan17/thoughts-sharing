import type { ExportData } from "./types";

export type TrashEntry = {
  id: string;
  snapshot: ExportData;
  deletedAt: string;
  label: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  entries: TrashEntry[];
  onRestore: (entry: TrashEntry) => void;
  onDeletePermanently: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function TrashDialog({ entries, onRestore, onDeletePermanently, onClearAll, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Trash</span>
          {entries.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-red-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Trash is empty</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {entry.label || "Untitled"}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Deleted {timeAgo(entry.deletedAt)}
                  </div>
                </div>
                <button
                  onClick={() => onRestore(entry)}
                  className="shrink-0 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => onDeletePermanently(entry.id)}
                  className="shrink-0 text-xs text-red-400 hover:text-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 text-center">
          Restored thoughts reappear in your sidebar
        </div>
      </div>
    </div>
  );
}
