export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const groups = [
    { label: "Global", items: [
      { keys: ["?"], desc: "Show this panel" },
      { keys: ["Ctrl", "K"], desc: "Search all nodes" },
      { keys: ["Ctrl", "Z"], desc: "Undo last change" },
      { keys: ["F"], desc: "Toggle focus mode" },
    ]},
    { label: "Editing", items: [
      { keys: ["Ctrl", "↵"], desc: "Save node" },
      { keys: ["Esc"], desc: "Cancel edit" },
    ]},
    { label: "Search", items: [
      { keys: ["↑↓"], desc: "Navigate results" },
      { keys: ["↵"], desc: "Jump to result" },
      { keys: ["Esc"], desc: "Close" },
    ]},
    { label: "Mobile", items: [
      { keys: ["Swipe →"], desc: "Open sidebar" },
      { keys: ["Swipe ←"], desc: "Close sidebar" },
    ]},
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Keyboard Shortcuts</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                {g.label}
              </p>
              <div className="space-y-2">
                {g.items.map((item) => (
                  <div key={item.desc} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{item.desc}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {item.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-gray-300 dark:text-gray-600 text-xs mx-0.5">+</span>}
                          <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700 font-mono">
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 text-center">
          Press ? to toggle
        </div>
      </div>
    </div>
  );
}
