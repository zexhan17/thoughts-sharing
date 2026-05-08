import { useEffect, useRef, useState } from "react";
import { useNodes } from "../diary/useNodes";
import { NoteTree, firstLine } from "../diary/NoteTree";
import { MapView } from "../diary/MapView";
import { PinDialog } from "../diary/PinDialog";
import { ConfirmDialog } from "../diary/ConfirmDialog";
import { buildShareUrl, decodeShareHash, findExistingRootId } from "../diary/share";
import { SearchDialog } from "../diary/SearchDialog";
import { MoveDialog } from "../diary/MoveDialog";
import { ShortcutsDialog } from "../diary/ShortcutsDialog";
import { TrashDialog } from "../diary/TrashDialog";
import type { TrashEntry } from "../diary/TrashDialog";
import { SEED_THOUGHTS } from "../diary/seedData";

const TRASH_KEY = "diary-trash";
const COLORS_KEY = "diary-colors";

const LABEL_COLORS = [
  { id: "red",    hex: "#f87171" },
  { id: "orange", hex: "#fb923c" },
  { id: "yellow", hex: "#facc15" },
  { id: "green",  hex: "#4ade80" },
  { id: "teal",   hex: "#2dd4bf" },
  { id: "blue",   hex: "#60a5fa" },
  { id: "purple", hex: "#a78bfa" },
  { id: "pink",   hex: "#f472b6" },
];
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Thought Tree" },
    { name: "description", content: "A tree-structured digital notepad" },
  ];
}

async function hashPin(pin: string, nodeId: string): Promise<string> {
  const data = new TextEncoder().encode(`${nodeId}:${pin}:diary-lock`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const PINS_KEY = "diary-pins";

function validateExportData(data: unknown): data is import("../diary/types").ExportData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.version !== 2) return false;
  if (!d.thought || typeof d.thought !== "object") return false;
  const t = d.thought as Record<string, unknown>;
  return typeof t.content === "string" && Array.isArray(t.children);
}

type BulkExport = { version: "bulk-2"; exportedAt: string; thoughts: import("../diary/types").ExportData[] };

function validateBulkExport(data: unknown): data is BulkExport {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.version === "bulk-2" && Array.isArray(d.thoughts);
}

export default function Home() {
  const { nodes, hydrated, lastSavedAt, createNode, updateNode, deleteNode, moveNode, exportThought, importThought, importMany, replaceThought, undo, seedThoughts } = useNodes();

  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [initialEditId, setInitialEditId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "map">("tree");
  const [isDark, setIsDark] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [colorsMap, setColorsMap] = useState<Record<string, string>>({});
  const [colorPickerRootId, setColorPickerRootId] = useState<string | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [pinsMap, setPinsMap] = useState<Record<string, string>>({});
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [pinDialog, setPinDialog] = useState<{ id: string; mode: "unlock" | "set" | "change-verify" | "change-new" } | null>(null);
  const [pinError, setPinError] = useState("");

  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal] = useState(0);

  const [rootOrder, setRootOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(224);

  const prevRootRef = useRef<string | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ active: boolean; startX: number; startWidth: number }>({ active: false, startX: 0, startWidth: 224 });

  const isLocked = (id: string | null) => !!id && !!pinsMap[id] && !unlockedIds.has(id);

  const roots = (() => {
    const all = Object.values(nodes).filter((n) => n.parentId === null);
    const ordered = rootOrder
      .map((id) => all.find((n) => n.id === id))
      .filter(Boolean) as typeof all;
    const unseen = all.filter((n) => !rootOrder.includes(n.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return [...ordered, ...unseen];
  })();


  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    if (window.innerWidth < 768) setSidebarOpen(false);
    const saved = localStorage.getItem("sidebar-width");
    if (saved) {
      const w = parseInt(saved);
      if (w >= 224 && w <= 480) setSidebarWidth(w);
    }
    try {
      const rawTrash = localStorage.getItem(TRASH_KEY);
      if (rawTrash) setTrashEntries(JSON.parse(rawTrash));
    } catch {}
    try {
      const rawColors = localStorage.getItem(COLORS_KEY);
      if (rawColors) setColorsMap(JSON.parse(rawColors));
    } catch {}
  }, []);

  // Sidebar resize (desktop)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizeRef.current.active) return;
      const w = Math.min(480, Math.max(224, resizeRef.current.startWidth + e.clientX - resizeRef.current.startX));
      setSidebarWidth(w);
    }
    function onUp() {
      if (!resizeRef.current.active) return;
      resizeRef.current.active = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("diary-root-order");
      if (raw) setRootOrder(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const allRootIds = Object.values(nodes)
      .filter((n) => n.parentId === null)
      .map((n) => n.id);
    setRootOrder((prev) => {
      const filtered = prev.filter((id) => allRootIds.includes(id));
      const unseen = allRootIds
        .filter((id) => !filtered.includes(id))
        .sort((a, b) => nodes[a].createdAt.localeCompare(nodes[b].createdAt));
      const next = [...filtered, ...unseen];
      localStorage.setItem("diary-root-order", JSON.stringify(next));
      return next;
    });
  }, [nodes, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save indicator
  useEffect(() => {
    if (!lastSavedAt) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((s) => !s);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") return;
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") return;
        setShowShortcuts((s) => !s);
        return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PINS_KEY);
      if (raw) setPinsMap(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    function onVis() {
      if (document.hidden) setUnlockedIds(new Set());
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
    };
  }, []);

  useEffect(() => {
    const prev = prevRootRef.current;
    if (prev && prev !== selectedRootId) {
      setUnlockedIds((s) => {
        const n = new Set(s);
        n.delete(prev);
        return n;
      });
    }
    prevRootRef.current = selectedRootId;
  }, [selectedRootId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!selectedRootId) {
      const first = Object.values(nodes)
        .filter((n) => n.parentId === null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (first) setSelectedRootId(first.id);
    }
  }, [hydrated, nodes]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (isLocked(id)) {
      setPinError("");
      setPinDialog({ id, mode: "unlock" });
    }
  }

  function handleDuplicateRoot(id: string) {
    const exported = exportThought(id);
    const newId = importThought(exported, null);
    setSelectedRootId(newId);
    toast("Thought duplicated");
  }

  function handleCreateChild(parentId: string): string {
    return createNode("", parentId);
  }

  function handleUpdateNode(id: string, content: string) {
    updateNode(id, content);
    setInitialEditId(null);
  }

  function handleDeleteNode(id: string) {
    const node = nodes[id];
    if (node?.parentId === null) {
      // Soft-delete root thoughts to trash
      const entry: TrashEntry = {
        id,
        snapshot: exportThought(id),
        deletedAt: new Date().toISOString(),
        label: firstLine(node.content) || "Untitled",
      };
      const nextTrash = [entry, ...trashEntries].slice(0, 50);
      setTrashEntries(nextTrash);
      localStorage.setItem(TRASH_KEY, JSON.stringify(nextTrash));
    }
    deleteNode(id);
    if (pinsMap[id]) {
      const next = { ...pinsMap };
      delete next[id];
      setPinsMap(next);
      localStorage.setItem(PINS_KEY, JSON.stringify(next));
    }
    setUnlockedIds((s) => { const n = new Set(s); n.delete(id); return n; });
    if (id === selectedRootId) {
      const remaining = Object.values(nodes)
        .filter((n) => n.parentId === null && n.id !== id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setSelectedRootId(remaining[0]?.id ?? null);
    }
  }

  function handleRestore(entry: TrashEntry) {
    const id = importThought(entry.snapshot, null);
    setSelectedRootId(id);
    const nextTrash = trashEntries.filter((e) => e.id !== entry.id);
    setTrashEntries(nextTrash);
    localStorage.setItem(TRASH_KEY, JSON.stringify(nextTrash));
    setShowTrash(false);
    toast(`"${entry.label}" restored`);
  }

  function handlePermanentDelete(id: string) {
    const nextTrash = trashEntries.filter((e) => e.id !== id);
    setTrashEntries(nextTrash);
    localStorage.setItem(TRASH_KEY, JSON.stringify(nextTrash));
  }

  function handleClearTrash() {
    setTrashEntries([]);
    localStorage.setItem(TRASH_KEY, JSON.stringify([]));
  }

  function handleColorChange(rootId: string, color: string | null) {
    const next = { ...colorsMap };
    if (color) next[rootId] = color; else delete next[rootId];
    setColorsMap(next);
    localStorage.setItem(COLORS_KEY, JSON.stringify(next));
    setColorPickerRootId(null);
  }

  function handleCopyShare(rootId: string) {
    const data = exportThought(rootId);
    const url = buildShareUrl(data);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(rootId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function handleLockClick(e: React.MouseEvent, rootId: string) {
    e.stopPropagation();
    if (!pinsMap[rootId]) {
      setPinError("");
      setPinDialog({ id: rootId, mode: "set" });
    } else if (unlockedIds.has(rootId)) {
      setUnlockedIds((s) => { const n = new Set(s); n.delete(rootId); return n; });
    } else {
      setPinError("");
      setPinDialog({ id: rootId, mode: "unlock" });
    }
  }

  async function handlePinConfirm(pin: string) {
    if (!pinDialog) return;
    const { id, mode } = pinDialog;
    setPinError("");
    if (mode === "set" || mode === "change-new") {
      const hash = await hashPin(pin, id);
      const next = { ...pinsMap, [id]: hash };
      setPinsMap(next);
      localStorage.setItem(PINS_KEY, JSON.stringify(next));
      setPinDialog(null);
      if (mode === "change-new") toast("PIN changed");
    } else if (mode === "unlock") {
      const hash = await hashPin(pin, id);
      if (hash === pinsMap[id]) {
        setUnlockedIds((s) => new Set([...s, id]));
        setPinDialog(null);
      } else {
        setPinError("Incorrect PIN");
      }
    } else if (mode === "change-verify") {
      const hash = await hashPin(pin, id);
      if (hash === pinsMap[id]) {
        setPinDialog({ id, mode: "change-new" });
      } else {
        setPinError("Incorrect PIN");
      }
    }
  }

  function handleSearchSelect(nodeId: string, rootId: string) {
    setShowSearch(false);
    setSelectedRootId(rootId);
    setScrollToId(nodeId);
    if (window.innerWidth < 768) setSidebarOpen(false);
    setTimeout(() => setScrollToId(null), 3000);
  }

  function handleRemovePin(rootId: string) {
    const next = { ...pinsMap };
    delete next[rootId];
    setPinsMap(next);
    localStorage.setItem(PINS_KEY, JSON.stringify(next));
    setUnlockedIds((s) => { const n = new Set(s); n.delete(rootId); return n; });
    toast("PIN removed");
  }

  function handleMoveComplete(newParentId: string | null) {
    if (!movingNodeId) return;
    const node = nodes[movingNodeId];
    if (!node) { setMovingNodeId(null); return; }
    moveNode(movingNodeId, newParentId);
    // If moved node was a root and is now a child, or vice-versa, adjust selection
    if (newParentId === null && node.parentId !== null) {
      // became a root — select it
      setSelectedRootId(movingNodeId);
    } else if (newParentId !== null && node.parentId === null) {
      // was a root, now a child — find its new root and select that
      let cur = nodes[newParentId];
      while (cur?.parentId) cur = nodes[cur.parentId];
      if (cur) setSelectedRootId(cur.id);
    }
    setMovingNodeId(null);
  }

  function handleExport() {
    if (!selectedRootId || !nodes[selectedRootId]) return;
    const data = exportThought(selectedRootId);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = firstLine(nodes[selectedRootId].content) || "untitled";
    a.download = `thought-${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";

    const collected: import("../diary/types").ExportData[] = [];
    let failed = 0;
    let completed = 0;

    function finish() {
      if (collected.length === 0) {
        toast(failed > 0 ? "Import failed — invalid file format" : "No valid data found");
        return;
      }
      const ids = importMany(collected);
      setSelectedRootId(ids[ids.length - 1]);
      const msg = collected.length === 1
        ? `"${firstLine(collected[0].thought.content)}" imported`
        : `${collected.length} thoughts imported${failed ? `, ${failed} failed` : ""}`;
      toast(msg);
    }

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (validateBulkExport(data)) {
            const valid = data.thoughts.filter(validateExportData);
            failed += data.thoughts.length - valid.length;
            collected.push(...valid);
          } else if (validateExportData(data)) {
            collected.push(data);
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        completed++;
        if (completed === files.length) finish();
      };
      reader.readAsText(file);
    }
  }

  function handleBulkExport() {
    const exportable = roots.filter((r) => !isLocked(r.id));
    if (exportable.length === 0) { toast("No unlocked thoughts to export"); return; }
    const bulk: BulkExport = {
      version: "bulk-2",
      exportedAt: new Date().toISOString(),
      thoughts: exportable.map((r) => exportThought(r.id)),
    };
    const blob = new Blob([JSON.stringify(bulk, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thought-tree-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${exportable.length} thought${exportable.length !== 1 ? "s" : ""} exported`);
  }

  function handleDragStart(id: string) { setDraggedId(id); }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (id !== draggedId) setDragOverId(id);
  }
  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setRootOrder((prev) => {
      const ids = prev.length ? prev : roots.map((r) => r.id);
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...ids];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      localStorage.setItem("diary-root-order", JSON.stringify(next));
      return next;
    });
    setDraggedId(null);
    setDragOverId(null);
  }
  function handleDragEnd() { setDraggedId(null); setDragOverId(null); }

  function handleResizeMouseDown(e: React.MouseEvent) {
    resizeRef.current = { active: true, startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }

  // Swipe to open/close sidebar on mobile
  function handleMainTouchStart(e: React.TouchEvent) {
    swipeStartX.current = e.touches[0].clientX;
  }
  function handleMainTouchEnd(e: React.TouchEvent) {
    if (swipeStartX.current === null) return;
    const startX = swipeStartX.current;
    const dx = e.changedTouches[0].clientX - startX;
    swipeStartX.current = null;
    if (startX < 40 && dx > 50) setSidebarOpen(true);
    else if (dx < -60) setSidebarOpen(false);
  }

  return (
    <div className="flex h-dvh bg-white dark:bg-gray-950 overflow-hidden">

      {/* Hidden file input for import */}
      <input ref={importInputRef} type="file" accept=".json" multiple className="hidden" onChange={handleImportFile} />

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{ width: sidebarWidth }}
        className={[
          "fixed inset-y-0 left-0 z-30 flex flex-col shrink-0",
          "border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900",
          "transition-transform duration-200",
          "md:relative md:inset-auto md:z-auto md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >

        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Thoughts
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowSearch(true)}
              title="Search (Ctrl+K)"
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts (?)"
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs font-bold"
            >
              ?
            </button>
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

        {/* Root thought list */}
        <div className="flex-1 overflow-y-auto py-1">
          {roots.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">No thoughts yet</p>
              <button onClick={handleCreateRoot} className="text-xs text-violet-600 dark:text-violet-400 hover:underline">
                Create one
              </button>
            </div>
          ) : (
            roots.map((root) => {
              const isActive = selectedRootId === root.id;
              const locked = isLocked(root.id);
              const hasPin = !!pinsMap[root.id];
              const isDragging = draggedId === root.id;
              const isDragOver = dragOverId === root.id;
              return (
                <div
                  key={root.id}
                  draggable
                  onDragStart={() => handleDragStart(root.id)}
                  onDragOver={(e) => handleDragOver(e, root.id)}
                  onDrop={() => handleDrop(root.id)}
                  onDragEnd={handleDragEnd}
                  className={`group flex items-center gap-1 mx-1 my-0.5 px-2 py-1.5 rounded-md transition-colors ${
                    isDragging ? "opacity-40" : ""
                  } ${
                    isDragOver ? "ring-1 ring-violet-400 dark:ring-violet-500" : ""
                  } ${
                    isActive
                      ? "bg-violet-50 dark:bg-violet-900/30"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {/* Drag handle */}
                  <span className="shrink-0 flex items-center cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8-16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
                    </svg>
                  </span>
                  {/* Color dot */}
                  <span
                    className="shrink-0 w-2 h-2 rounded-full transition-colors"
                    style={{ background: colorsMap[root.id] ? LABEL_COLORS.find(c => c.id === colorsMap[root.id])?.hex ?? "transparent" : "transparent" }}
                  />
                  <button
                    onClick={() => handleSelectRoot(root.id)}
                    className={`flex-1 min-w-0 text-left ${
                      isActive ? "text-violet-700 dark:text-violet-300" : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <div className={`text-sm truncate ${isActive ? "font-medium" : ""}`}>
                      {locked
                        ? <span className="italic text-amber-500 dark:text-amber-400">Locked</span>
                        : firstLine(root.content) || <span className="italic text-gray-400 dark:text-gray-600">Untitled</span>
                      }
                    </div>
                  </button>
                  {/* Lock button */}
                  <button
                    onClick={(e) => handleLockClick(e, root.id)}
                    title={hasPin ? (locked ? "Unlock thought" : "Lock thought") : "Set PIN lock"}
                    className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      locked
                        ? "opacity-100 text-amber-500 hover:text-amber-600"
                        : "md:opacity-0 md:group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                  >
                    {locked ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar footer: import */}
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 px-3 py-2 flex flex-col gap-0.5">
          <button
            onClick={() => { seedThoughts(SEED_THOUGHTS); toast("Sample thoughts loaded"); }}
            className="w-full flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors py-1"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Load sample data
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="w-full flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>
          <button
            onClick={() => setShowTrash(true)}
            className="w-full flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Trash
            {trashEntries.length > 0 && (
              <span className="ml-auto text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5 leading-none">
                {trashEntries.length}
              </span>
            )}
          </button>
        </div>

        {/* Resize handle — desktop only */}
        <div
          className="hidden md:block absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-violet-400 dark:hover:bg-violet-600 transition-colors"
          onMouseDown={handleResizeMouseDown}
        />
      </aside>

      {/* Main content */}
      <div
        className="flex-1 flex flex-col min-w-0"
        onTouchStart={handleMainTouchStart}
        onTouchEnd={handleMainTouchEnd}
      >

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
              ? isLocked(selectedRootId) ? "Locked" : firstLine(nodes[selectedRootId].content) || "Untitled"
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

        {/* Toolbar */}
        {selectedRootId && nodes[selectedRootId] && !isLocked(selectedRootId) && (
          <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-1 gap-2 flex-wrap">
            {/* Left: view toggle + collapse/expand */}
            <div className="flex items-center gap-1">
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
              {viewMode === "tree" && (
                <>
                  <button
                    onClick={() => setCollapseSignal((s) => s + 1)}
                    title="Collapse all"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setExpandSignal((s) => s + 1)}
                    title="Expand all"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => { const newId = handleCreateChild(selectedRootId); setInitialEditId(newId); }}
                title="Add node"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => handleDuplicateRoot(selectedRootId)}
                title="Duplicate thought"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const w = 252;
                  const left = Math.max(4, Math.min(rect.left - 80, window.innerWidth - w - 4));
                  setColorPickerPos({ top: rect.bottom + 6, left });
                  setColorPickerRootId(colorPickerRootId === selectedRootId ? null : selectedRootId);
                }}
                title="Label color"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{ color: colorsMap[selectedRootId] ? LABEL_COLORS.find(c => c.id === colorsMap[selectedRootId])?.hex : undefined }}
              >
                <svg className={`w-4 h-4 ${colorsMap[selectedRootId] ? "" : "text-gray-400 dark:text-gray-500"}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.53-.2-1.01-.52-1.38-.31-.36-.49-.84-.49-1.32 0-1.1.9-2 2-2h2.36c3.09 0 5.65-2.56 5.65-5.65C22.99 6.01 17.99 2 12 2zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5S18.33 11 17.5 11z"/>
                </svg>
              </button>
              <button
                onClick={() => handleCopyShare(selectedRootId)}
                title="Copy share link"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                  copiedId === selectedRootId
                    ? "text-green-500"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {copiedId === selectedRootId ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleExport}
                title="Export to file"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              {pinsMap[selectedRootId] && (
                <>
                  <button
                    onClick={() => { setPinError(""); setPinDialog({ id: selectedRootId, mode: "change-verify" }); }}
                    title="Change PIN"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleRemovePin(selectedRootId)}
                    title="Remove PIN"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                    </svg>
                  </button>
                </>
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete thought"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
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

        {/* Tree / Map / locked / empty state */}
        {selectedRootId && nodes[selectedRootId] ? (
          isLocked(selectedRootId) ? (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <div>
                <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Thought locked</h2>
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">Enter your PIN to view this thought</p>
                <button
                  onClick={() => { setPinError(""); setPinDialog({ id: selectedRootId, mode: "unlock" }); }}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors"
                >
                  Enter PIN
                </button>
              </div>
            </div>
          ) : viewMode === "map" ? (
            <MapView
              key={selectedRootId}
              isDark={isDark}
              nodesMap={Object.fromEntries(
                Object.entries(nodes).filter(([, n]) => {
                  let cur: typeof n | undefined = n;
                  while (cur) {
                    if (cur.id === selectedRootId) return true;
                    cur = cur.parentId ? nodes[cur.parentId] : undefined;
                  }
                  return false;
                })
              )}
              onUpdate={handleUpdateNode}
              onCreateChild={handleCreateChild}
              onDelete={handleDeleteNode}
            />
          ) : (
            <NoteTree
              key={selectedRootId}
              rootId={selectedRootId}
              nodes={nodes}
              initialEditId={initialEditId}
              collapseSignal={collapseSignal}
              expandSignal={expandSignal}
              scrollToId={scrollToId}
              onUpdate={handleUpdateNode}
              onCreateChild={handleCreateChild}
              onDelete={handleDeleteNode}
              onMove={(nodeId) => setMovingNodeId(nodeId)}
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

      {/* Delete thought confirm */}
      {showDeleteConfirm && selectedRootId && (
        <ConfirmDialog
          message="Delete this entire thought and all its nodes?"
          onConfirm={() => { setShowDeleteConfirm(false); handleDeleteNode(selectedRootId); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Search dialog */}
      {showSearch && (
        <SearchDialog
          nodes={nodes}
          lockedRootIds={new Set(roots.filter((r) => isLocked(r.id)).map((r) => r.id))}
          onSelect={handleSearchSelect}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* PIN dialog */}
      {pinDialog && (
        <PinDialog
          key={pinDialog.mode}
          mode={pinDialog.mode}
          externalError={pinError || undefined}
          onConfirm={handlePinConfirm}
          onCancel={() => { setPinDialog(null); setPinError(""); }}
          onChangePinRequest={pinDialog.mode === "unlock" ? () => {
            setPinError("");
            setPinDialog({ id: pinDialog.id, mode: "change-verify" });
          } : undefined}
        />
      )}

      {/* Color picker popover */}
      {colorPickerRootId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColorPickerRootId(null)} />
          <div
            className="fixed z-50 flex items-center gap-1.5 p-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 flex-wrap"
            style={{ top: colorPickerPos.top, left: colorPickerPos.left, maxWidth: "calc(100vw - 8px)" }}
          >
            {LABEL_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => handleColorChange(colorPickerRootId, c.id)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                style={{
                  background: c.hex,
                  outline: colorsMap[colorPickerRootId] === c.id ? `2px solid ${c.hex}` : "none",
                  outlineOffset: "2px",
                }}
              />
            ))}
            <button
              onClick={() => handleColorChange(colorPickerRootId, null)}
              className="w-5 h-5 rounded-full border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors shrink-0"
              title="Remove color"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Move dialog */}
      {movingNodeId && (
        <MoveDialog
          nodeId={movingNodeId}
          nodes={nodes}
          onMove={handleMoveComplete}
          onClose={() => setMovingNodeId(null)}
        />
      )}

      {/* Shortcuts dialog */}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      {/* Trash dialog */}
      {showTrash && (
        <TrashDialog
          entries={trashEntries}
          onRestore={handleRestore}
          onDeletePermanently={handlePermanentDelete}
          onClearAll={handleClearTrash}
          onClose={() => setShowTrash(false)}
        />
      )}

      {/* Auto-save badge */}
      <div className={`fixed bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-full shadow-lg transition-opacity duration-300 pointer-events-none ${showSaved ? "opacity-100" : "opacity-0"}`}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Saved
      </div>
    </div>
  );
}
