import { useEffect, useState } from "react";
import { useNodes } from "../diary/useNodes";
import { TreeView } from "../diary/TreeView";
import { NodeDialog } from "../diary/NodeDialog";
import { DeleteDialog } from "../diary/DeleteDialog";
import { NodeDetail } from "../diary/NodeDetail";
import { ReadMode } from "../diary/ReadMode";
import type { ExportData } from "../diary/types";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Thought Tree — Digital Diary" },
    { name: "description", content: "A tree-structured digital diary for your thoughts" },
  ];
}

type DialogState =
  | { type: "create-root" }
  | { type: "create-child"; parentId: string }
  | { type: "edit"; nodeId: string }
  | { type: "delete"; nodeId: string }
  | null;

function downloadJSON(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFile(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ExportData;
        if (data.version !== 1 || !data.thought) throw new Error("Invalid format");
        resolve(data);
      } catch {
        reject(new Error("Invalid file — expected a Thought Tree export (.json)"));
      }
    };
    reader.readAsText(file);
  });
}

export default function Home() {
  const {
    nodes,
    createNode,
    updateNode,
    deleteNode,
    markRead,
    getReadOrder,
    getAncestors,
    exportThought,
    importThought,
  } = useNodes();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [readMode, setReadMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // closed by default on mobile
  const [isDark, setIsDark] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    // On desktop default to open; on mobile keep closed
    if (window.innerWidth >= 768) setSidebarOpen(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDark() {
    setIsDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }

  const selectedNode = selectedId ? nodes[selectedId] ?? null : null;

  function openAddRoot() { setDialog({ type: "create-root" }); }
  function openAddChild(parentId: string) { setDialog({ type: "create-child", parentId }); }
  function openEdit(nodeId: string) { setDialog({ type: "edit", nodeId }); }
  function openDelete(nodeId: string) { setDialog({ type: "delete", nodeId }); }
  function closeDialog() { setDialog(null); }

  function handleSave(title: string, content: string) {
    if (!dialog) return;
    if (dialog.type === "create-root") {
      setSelectedId(createNode(title, content, null));
    } else if (dialog.type === "create-child") {
      setSelectedId(createNode(title, content, dialog.parentId));
    } else if (dialog.type === "edit") {
      updateNode(dialog.nodeId, title, content);
    }
    closeDialog();
  }

  function handleDelete() {
    if (!dialog || dialog.type !== "delete") return;
    const nodeId = dialog.nodeId;
    const parentId = nodes[nodeId]?.parentId ?? null;
    deleteNode(nodeId);
    closeDialog();
    if (selectedId === nodeId) setSelectedId(parentId);
  }

  function handleExport(nodeId: string) {
    const data = exportThought(nodeId);
    const slug = nodes[nodeId]?.title.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase() ?? "thought";
    downloadJSON(data, `${slug}.json`);
  }

  async function handleImport(file: File, parentId: string | null) {
    setImportError(null);
    try {
      const data = await readFile(file);
      const id = importThought(data, parentId);
      setSelectedId(id);
      // Close sidebar on mobile after import
      if (window.innerWidth < 768) setSidebarOpen(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
      setTimeout(() => setImportError(null), 4000);
    }
  }

  function handleSelectNode(id: string) {
    setSelectedId(id);
    // Close sidebar on mobile after selecting a note
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  // Find root ancestor of the selected node to scope read mode
  function findRootId(id: string | null): string | null {
    if (!id || !nodes[id]) return null;
    let current = nodes[id];
    while (current.parentId && nodes[current.parentId]) {
      current = nodes[current.parentId];
    }
    return current.id;
  }

  const readRootId = findRootId(selectedId);
  const readOrderNodes = readRootId ? getReadOrder(readRootId) : getReadOrder();
  const readNodesMap = readRootId
    ? Object.fromEntries(readOrderNodes.map((n) => [n.id, n]))
    : nodes;

  return (
    <div className="flex h-dvh bg-white dark:bg-gray-950 overflow-hidden">

      {/* Mobile backdrop — closes sidebar on tap-outside */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, inline on desktop */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-30 w-72",           // mobile: fixed drawer
          "md:relative md:inset-auto md:z-auto",          // desktop: inline
          "flex flex-col shrink-0",
          "border-r border-gray-100 dark:border-gray-800",
          "bg-white dark:bg-gray-900",
          "transition-all duration-200 ease-in-out",
          sidebarOpen
            ? "translate-x-0 md:w-72"
            : "-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden",
        ].join(" ")}
      >
        <TreeView
          nodes={nodes}
          selectedId={selectedId}
          onSelect={handleSelectNode}
          onAddRoot={openAddRoot}
          onAddChild={openAddChild}
          onEdit={openEdit}
          onDelete={openDelete}
          onImportRoot={(file) => handleImport(file, null)}
        />
      </aside>

      {/* Main area — always full-width on mobile */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-3 sm:px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Toggle sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 hidden sm:inline">
                Thought Tree
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              title={isDark ? "Light mode" : "Dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {Object.keys(nodes).length > 0 && (
              <button
                onClick={() => setReadMode(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-sm font-medium text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 rounded-lg transition-colors"
                title="Read Mode"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span className="hidden sm:inline">Read Mode</span>
              </button>
            )}

            <button
              onClick={openAddRoot}
              className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
              title="New Note"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">New Note</span>
            </button>
          </div>
        </header>

        {/* Import error toast */}
        {importError && (
          <div className="mx-3 sm:mx-4 mt-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {importError}
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {selectedNode ? (
            <NodeDetail
              node={selectedNode}
              nodes={nodes}
              ancestors={getAncestors(selectedNode.id)}
              onEdit={() => openEdit(selectedNode.id)}
              onDelete={() => openDelete(selectedNode.id)}
              onAddChild={() => openAddChild(selectedNode.id)}
              onExport={() => handleExport(selectedNode.id)}
              onImportChild={(file) => handleImport(file, selectedNode.id)}
              onSelectNode={handleSelectNode}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-4 sm:mb-5">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-violet-400 dark:text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              {Object.keys(nodes).length === 0 ? (
                <>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    Start your thought tree
                  </h2>
                  <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mb-5 sm:mb-6">
                    Create notes and organise them in a tree. Each note can have unlimited child notes.
                  </p>
                  <button
                    onClick={openAddRoot}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create first note
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-base font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Select a note
                  </h2>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Tap the menu to open your notes
                  </p>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Read Mode overlay */}
      {readMode && (
        <ReadMode
          nodes={readOrderNodes}
          nodesMap={readNodesMap}
          onMarkRead={(id, isRead) => markRead(id, isRead)}
          onExit={() => setReadMode(false)}
        />
      )}

      {/* Dialogs */}
      {dialog?.type === "create-root" && (
        <NodeDialog mode="create" parentNode={null} editingNode={null} onSave={handleSave} onClose={closeDialog} />
      )}
      {dialog?.type === "create-child" && (
        <NodeDialog
          mode="create"
          parentNode={nodes[dialog.parentId] ?? null}
          editingNode={null}
          onSave={handleSave}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "edit" && nodes[dialog.nodeId] && (
        <NodeDialog mode="edit" parentNode={null} editingNode={nodes[dialog.nodeId]} onSave={handleSave} onClose={closeDialog} />
      )}
      {dialog?.type === "delete" && nodes[dialog.nodeId] && (
        <DeleteDialog node={nodes[dialog.nodeId]} nodes={nodes} onConfirm={handleDelete} onClose={closeDialog} />
      )}
    </div>
  );
}
