import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useNodes } from "../diary/useNodes";
import type { TrashEntry } from "../diary/TrashDialog";
import type { Route } from "./+types/trash";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Trash — Thoughts" }];
}

const TRASH_KEY = "diary-trash";

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [clearStep, setClearStep] = useState<"idle" | "confirm">("idle");
  const [toast, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    try { const r = localStorage.getItem(TRASH_KEY); if (r) setEntries(JSON.parse(r)); } catch {}
  }, []);

  function save(next: TrashEntry[]) {
    setEntries(next);
    localStorage.setItem(TRASH_KEY, JSON.stringify(next));
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  function handleRestore(entry: TrashEntry) {
    const id = importThought(entry.snapshot, null);
    save(entries.filter((e) => e.id !== entry.id));
    showToast(`"${entry.label}" restored`);
    navigate(`/thought/${id}`);
  }

  function handleDeletePermanently(id: string) {
    save(entries.filter((e) => e.id !== id));
    setConfirmDeleteId(null);
    showToast("Deleted permanently");
  }

  function handleClearAll() {
    save([]);
    setClearStep("idle");
    showToast("Trash cleared");
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-[#0a0a0b]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-gray-50/90 dark:bg-[#0a0a0b]/90 backdrop-blur-md border-b border-gray-200/70 dark:border-gray-800/70">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="cursor-pointer flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 shrink-0" />

          <h1 className="flex-1 font-semibold text-[15px] text-gray-900 dark:text-gray-50">Trash</h1>

          {entries.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-600 font-medium">{entries.length} item{entries.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center anim-fade-up">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800/60 flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500">Trash is empty</p>
          </div>
        ) : (
          <>
            {/* Clear all row */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-400 dark:text-gray-500">Deleted thoughts are kept for up to 50 items</p>

              {clearStep === "idle" ? (
                <button
                  onClick={() => setClearStep("confirm")}
                  className="text-xs font-medium text-red-400 hover:text-red-500 dark:text-red-500 dark:hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-3 py-2 anim-pop-in">
                  <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">Permanently delete all {entries.length} items?</span>
                  <button
                    onClick={handleClearAll}
                    className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    Delete all
                  </button>
                  <button
                    onClick={() => setClearStep("idle")}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Entries list */}
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-2xl px-4 py-3.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                      {entry.label || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Deleted {timeAgo(entry.deletedAt)}
                    </p>
                  </div>

                  {confirmDeleteId === entry.id ? (
                    <div className="shrink-0 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-3 py-1.5 anim-pop-in">
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">Delete forever?</span>
                      <button
                        onClick={() => handleDeletePermanently(entry.id)}
                        className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => handleRestore(entry)}
                        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        Restore
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 text-sm font-medium rounded-full shadow-xl anim-fade-up pointer-events-none">
          <svg className="w-3.5 h-3.5 text-green-400 dark:text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}
    </div>
  );
}
