import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useNodes } from "../diary/useNodes";
import type { TrashEntry } from "../diary/TrashDialog";
const TRASH_KEY = "diary-trash";

export function meta() {
  return [{ title: "Trash — Thought Tree" }];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TrashPage() {
  const navigate = useNavigate();
  const { importThought } = useNodes();
  const [entries, setEntries] = useState<TrashEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRASH_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {}
  }, []);

  function save(next: TrashEntry[]) {
    setEntries(next);
    localStorage.setItem(TRASH_KEY, JSON.stringify(next));
  }

  function handleRestore(entry: TrashEntry) {
    importThought(entry.snapshot, null);
    save(entries.filter((e) => e.id !== entry.id));
    navigate("/");
  }

  function handleDelete(id: string) {
    save(entries.filter((e) => e.id !== id));
  }

  function handleClearAll() {
    save([]);
  }

  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
          title="Back to home"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Trash</h1>
          {entries.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {entries.length} item{entries.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {entries.length > 0 && (
          <button
            onClick={handleClearAll}
            className="shrink-0 text-xs text-red-400 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 transition-colors font-medium"
          >
            Clear all
          </button>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Trash is empty</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">Deleted thoughts appear here for recovery</p>
            <Link
              to="/"
              className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-gray-900 ${idx !== entries.length - 1 ? "border-b border-gray-50 dark:border-gray-800" : ""}`}
              >
                {/* Icon */}
                <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate font-medium">
                    {entry.label || "Untitled"}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Deleted {timeAgo(entry.deletedAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(entry)}
                    className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                  >
                    Restore
                  </button>
                  <span className="text-gray-200 dark:text-gray-700">·</span>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="text-xs text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
            Restored thoughts reappear in your sidebar
          </p>
        )}
      </div>
    </div>
  );
}
