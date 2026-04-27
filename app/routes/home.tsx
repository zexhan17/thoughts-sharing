import { useEffect, useState } from "react";
import { useNodes } from "../diary/useNodes";
import { NoteTree, firstLine } from "../diary/NoteTree";
import { MapView } from "../diary/MapView";
import { buildShareUrl, decodeShareHash, findExistingRootId } from "../diary/share";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Thought Tree" },
    { name: "description", content: "A tree-structured digital notepad" },
  ];
}

export default function Home() {
  const { nodes, hydrated, createNode, updateNode, deleteNode, exportThought, importThought, replaceThought } = useNodes();

  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [initialEditId, setInitialEditId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "map">("tree");
  const [isDark, setIsDark] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const roots = Object.values(nodes)
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  // Auto-select first root after hydration
  useEffect(() => {
    if (!hydrated) return;
    if (!selectedRootId) {
      const first = Object.values(nodes)
        .filter((n) => n.parentId === null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (first) setSelectedRootId(first.id);
    }
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle incoming share URL
  useEffect(() => {
    if (!hydrated) return;
    const shared = decodeShareHash(window.location.hash);
    if (!shared) return;
    window.location.hash = "";
    const existingRootId = findExistingRootId(shared, nodes);
    if (existingRootId) {
      const id = replaceThought(existingRootId, shared);
      setSelectedRootId(id);
      toast(`"${firstLine(shared.thought.content)}" updated`);
    } else {
      const id = importThought(shared, null);
      setSelectedRootId(id);
      toast(`"${firstLine(shared.thought.content)}" saved to your thoughts`);
    }
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  function toast(msg: string) {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 4000);
  }

  function toggleDark() {
    setIsDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }

  function handleCreateRoot() {
    const id = createNode("", null);
    setSelectedRootId(id);
    setInitialEditId(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function handleSelectRoot(id: string) {
    setSelectedRootId(id);
    setInitialEditId(null);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function handleCreateChild(parentId: string): string {
    return createNode("", parentId);
  }

  function handleUpdateNode(id: string, content: string) {
    updateNode(id, content);
    setInitialEditId(null);
  }

  function handleDeleteNode(id: string) {
    deleteNode(id);
    if (id === selectedRootId) {
      const remaining = Object.values(nodes)
        .filter((n) => n.parentId === null && n.id !== id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setSelectedRootId(remaining[0]?.id ?? null);
    }
  }

  function handleCopyShare(rootId: string) {
    const data = exportThought(rootId);
    const url = buildShareUrl(data);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(rootId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="flex h-dvh bg-white dark:bg-gray-950 overflow-hidden">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={[
        "fixed inset-y-0 left-0 z-30 w-56 flex flex-col",
        "border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900",
        "transition-transform duration-200",
        "md:relative md:inset-auto md:z-auto md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}>

        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Thoughts
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={toggleDark}
              title={isDark ? "Light mode" : "Dark mode"}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {isDark ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={handleCreateRoot}
              title="New thought"
              className="w-7 h-7 flex items-center justify-center rounded-md text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Root thought list — titles only */}
        <div className="flex-1 overflow-y-auto py-1">
          {roots.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">No thoughts yet</p>
              <button
                onClick={handleCreateRoot}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                Create one
              </button>
            </div>
          ) : (
            roots.map((root) => {
              const isActive = selectedRootId === root.id;
              return (
                <div
                  key={root.id}
                  className={`group flex items-center gap-1 mx-1 my-0.5 px-2 py-1 rounded-md transition-colors ${
                    isActive
                      ? "bg-violet-50 dark:bg-violet-900/30"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <button
                    onClick={() => handleSelectRoot(root.id)}
                    className={`flex-1 text-left text-sm truncate py-0.5 ${
                      isActive
                        ? "text-violet-700 dark:text-violet-300 font-medium"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {firstLine(root.content) || <span className="italic text-gray-400 dark:text-gray-600">Untitled</span>}
                  </button>
                  <button
                    onClick={() => handleCopyShare(root.id)}
                    title="Copy share link"
                    className={`shrink-0 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-colors ${
                      copiedId === root.id
                        ? "text-green-500 opacity-100"
                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                  >
                    {copiedId === root.id ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar — mobile only */}
        <header className="md:hidden shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">
            {selectedRootId && nodes[selectedRootId]
              ? firstLine(nodes[selectedRootId].content) || "Untitled"
              : "Thought Tree"}
          </span>
          <button
            onClick={handleCreateRoot}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </header>

        {/* View toggle + share toast */}
        {selectedRootId && nodes[selectedRootId] && (
          <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-1">
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("tree")}
                title="Tree view"
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === "tree"
                    ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h7" />
                </svg>
                Tree
              </button>
              <button
                onClick={() => setViewMode("map")}
                title="Map view"
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === "map"
                    ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Map
              </button>
            </div>
          </div>
        )}

        {shareToast && (
          <div className="mx-4 mt-2 px-4 py-2.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm rounded-xl flex items-center gap-2 shrink-0">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {shareToast}
          </div>
        )}

        {/* Tree / Map / empty state */}
        {selectedRootId && nodes[selectedRootId] ? (
          viewMode === "map" ? (
            <MapView
              key={selectedRootId}
              nodesMap={Object.fromEntries(
                Object.entries(nodes).filter(([, n]) => {
                  // include only nodes in the selected root's subtree
                  let cur: typeof n | undefined = n;
                  while (cur) {
                    if (cur.id === selectedRootId) return true;
                    cur = cur.parentId ? nodes[cur.parentId] : undefined;
                  }
                  return false;
                })
              )}
              onUpdate={handleUpdateNode}
            />
          ) : (
            <NoteTree
              key={selectedRootId}
              rootId={selectedRootId}
              nodes={nodes}
              initialEditId={initialEditId}
              onUpdate={handleUpdateNode}
              onCreateChild={handleCreateChild}
              onDelete={handleDeleteNode}
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-violet-400 dark:text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">
                {roots.length === 0 ? "Start your first thought" : "Select a thought"}
              </h2>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">
                {roots.length === 0
                  ? "Hit + to create a new thought tree"
                  : "Pick one from the sidebar"}
              </p>
              {roots.length === 0 && (
                <button
                  onClick={handleCreateRoot}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors"
                >
                  New thought
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
