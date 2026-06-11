import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useNodes } from "../diary/useNodes";
import { firstLine } from "../diary/NoteTree";
import { SearchDialog } from "../diary/SearchDialog";
import { PinDialog } from "../diary/PinDialog";
import { ConfirmDialog } from "../diary/ConfirmDialog";
import type { TrashEntry } from "../diary/TrashDialog";
import { buildShareUrl } from "../diary/share";
import { SEED_THOUGHTS } from "../diary/seedData";

import type { Route } from "./+types/home";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Thoughts" },
    { name: "description", content: "A tree-structured digital notepad" },
  ];
}

const TRASH_KEY = "diary-trash";
const COLORS_KEY = "diary-colors";
const GLOBAL_LOCK_KEY = "diary-global-lock-hash";
const LOCKED_IDS_KEY = "diary-locked-ids";

const LABEL_COLORS = [
  { id: "red", hex: "#f87171" },
  { id: "orange", hex: "#fb923c" },
  { id: "yellow", hex: "#facc15" },
  { id: "green", hex: "#4ade80" },
  { id: "teal", hex: "#2dd4bf" },
  { id: "blue", hex: "#60a5fa" },
  { id: "purple", hex: "#a78bfa" },
  { id: "pink", hex: "#f472b6" },
];

const ACCENT_COLORS = [
  { id: "red", name: "Red", hex: "#dc2626" },
  { id: "rose", name: "Rose", hex: "#e11d48" },
  { id: "orange", name: "Orange", hex: "#ea580c" },
  { id: "amber", name: "Amber", hex: "#d97706" },
  { id: "yellow", name: "Yellow", hex: "#ca8a04" },
  { id: "lime", name: "Lime", hex: "#65a30d" },
  { id: "green", name: "Green", hex: "#059669" },
  { id: "teal", name: "Teal", hex: "#0d9488" },
  { id: "cyan", name: "Cyan", hex: "#0891b2" },
  { id: "sky", name: "Sky", hex: "#0284c7" },
  { id: "blue", name: "Blue", hex: "#2563eb" },
  { id: "indigo", name: "Indigo", hex: "#4f46e5" },
  { id: "violet", name: "Violet", hex: "#7c3aed" },
  { id: "purple", name: "Purple", hex: "#9333ea" },
  { id: "fuchsia", name: "Fuchsia", hex: "#c026d3" },
  { id: "pink", name: "Pink", hex: "#db2777" },
] as const;
type ColorId = typeof ACCENT_COLORS[number]["id"];

type BulkExport = { version: "bulk-2"; exportedAt: string; thoughts: import("../diary/types").ExportData[] };

function validateExportData(data: unknown): data is import("../diary/types").ExportData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.version !== 2) return false;
  if (!d.thought || typeof d.thought !== "object") return false;
  const t = d.thought as Record<string, unknown>;
  return typeof t.content === "string" && Array.isArray(t.children);
}

function validateBulkExport(data: unknown): data is BulkExport {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.version === "bulk-2" && Array.isArray(d.thoughts);
}

async function hashGlobalPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`vault:${pin}:diary-lock`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}


export default function Home() {
  const navigate = useNavigate();
  const { nodes, hydrated, createNode, deleteNode, deleteMany, exportThought, importThought, importMany, seedThoughts } = useNodes();

  const [colorId, setColorId] = useState<ColorId>("violet");
  const [isDark, setIsDark] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [themePickerPos, setThemePickerPos] = useState({ top: 0, left: 0 });

  const [colorsMap, setColorsMap] = useState<Record<string, string>>({});
  const [pinsMap, setPinsMap] = useState<Record<string, string>>({});
  const [trashCount, setTrashCount] = useState(0);
  const [rootOrder, setRootOrder] = useState<string[]>([]);

  const [showSearch, setShowSearch] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [toast, setToastMsg] = useState<string | null>(null);

  // ── Selection mode ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // ── Reorder mode ──
  const [reorderMode, setReorderMode] = useState(false);

  const [globalLockHash, setGlobalLockHash] = useState<string | null>(null);
  const [globalUnlocked, setGlobalUnlocked] = useState(true);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [vaultDialog, setVaultDialog] = useState<"unlock" | "set" | "change-verify" | "change-new" | null>(null);
  const [vaultError, setVaultError] = useState("");
  const [showVaultMenu, setShowVaultMenu] = useState(false);

  const [colorPickerRootId, setColorPickerRootId] = useState<string | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const vaultMenuRef = useRef<HTMLDivElement>(null);

  const roots = (() => {
    const all = Object.values(nodes).filter((n) => n.parentId === null);
    const ordered = rootOrder.map((id) => all.find((n) => n.id === id)).filter(Boolean) as typeof all;
    const unseen = all.filter((n) => !rootOrder.includes(n.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return [...ordered, ...unseen];
  })();

  const isVaultLocked = !!globalLockHash && !globalUnlocked;
  const isProtected = (id: string) => lockedIds.has(id);
  const isLocked = (id: string) => isProtected(id) && isVaultLocked;

  useEffect(() => {
    const savedColor = localStorage.getItem("app-color") ?? "violet";
    const matchedColor = (ACCENT_COLORS.find((c) => c.id === savedColor) ? savedColor : "violet") as ColorId;
    setColorId(matchedColor);
    setIsDark(localStorage.getItem("app-dark") === "true");
    try { const r = localStorage.getItem(COLORS_KEY); if (r) setColorsMap(JSON.parse(r)); } catch { }
    const hash = localStorage.getItem(GLOBAL_LOCK_KEY);
    setGlobalLockHash(hash);
    if (!hash) { setGlobalUnlocked(true); } else { setGlobalUnlocked(sessionStorage.getItem("diary-vault-unlocked") === "1"); }
    try { const r = localStorage.getItem(LOCKED_IDS_KEY); if (r) setLockedIds(new Set(JSON.parse(r))); } catch { }
    try { const r = localStorage.getItem("diary-root-order"); if (r) setRootOrder(JSON.parse(r)); } catch { }
    try { const r = localStorage.getItem(TRASH_KEY); if (r) setTrashCount(JSON.parse(r).length); } catch { }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const allRootIds = Object.values(nodes).filter((n) => n.parentId === null).map((n) => n.id);
    setRootOrder((prev) => {
      const filtered = prev.filter((id) => allRootIds.includes(id));
      const unseen = allRootIds.filter((id) => !filtered.includes(id)).sort((a, b) => nodes[a].createdAt.localeCompare(nodes[b].createdAt));
      const next = [...filtered, ...unseen];
      localStorage.setItem("diary-root-order", JSON.stringify(next));
      return next;
    });
  }, [nodes, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setShowSearch((s) => !s); }
      if (e.key === "Escape") { exitSelectionMode(); setReorderMode(false); setShowOverflow(false); setShowVaultMenu(false); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showOverflow) return;
    function handle(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setShowOverflow(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showOverflow]);

  useEffect(() => {
    if (!showVaultMenu) return;
    function handle(e: MouseEvent) {
      if (vaultMenuRef.current && !vaultMenuRef.current.contains(e.target as Node)) setShowVaultMenu(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showVaultMenu]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }

  function applyColor(cid: ColorId, dark: boolean) {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.setAttribute("data-theme", cid);
    localStorage.setItem("app-color", cid);
    localStorage.setItem("app-dark", String(dark));
  }

  function handleCreateRoot() {
    const id = createNode("", null);
    navigate(`/thought/${id}`);
  }

  function handleSelectRoot(id: string) {
    if (reorderMode) return;
    navigate(`/thought/${id}`);
  }

  function handleDeleteRoot(id: string) {
    const node = nodes[id];
    if (!node) return;
    const entry: TrashEntry = {
      id,
      snapshot: exportThought(id),
      deletedAt: new Date().toISOString(),
      label: firstLine(node.content) || "Untitled",
    };
    const rawTrash = (() => { try { const r = localStorage.getItem(TRASH_KEY); return r ? JSON.parse(r) : []; } catch { return []; } })();
    const nextTrash = [entry, ...rawTrash].slice(0, 50);
    localStorage.setItem(TRASH_KEY, JSON.stringify(nextTrash));
    setTrashCount(nextTrash.length);
    deleteNode(id);
    if (lockedIds.has(id)) {
      setLockedIds(prev => {
        const next = new Set(prev); next.delete(id);
        localStorage.setItem(LOCKED_IDS_KEY, JSON.stringify([...next]));
        return next;
      });
    }
  }

  function handleDeleteSelected() {
    const deletable = Array.from(selectedIds);
    if (deletable.length === 0) { exitSelectionMode(); return; }

    const rawTrash = (() => { try { const r = localStorage.getItem(TRASH_KEY); return r ? JSON.parse(r) : []; } catch { return []; } })();
    const newEntries: TrashEntry[] = deletable.map((id) => ({
      id,
      snapshot: exportThought(id),
      deletedAt: new Date().toISOString(),
      label: firstLine(nodes[id]?.content ?? "") || "Untitled",
    }));
    const nextTrash = [...newEntries, ...rawTrash].slice(0, 50);
    localStorage.setItem(TRASH_KEY, JSON.stringify(nextTrash));
    setTrashCount(nextTrash.length);

    const toUnprotect = deletable.filter(id => lockedIds.has(id));
    if (toUnprotect.length > 0) {
      setLockedIds(prev => {
        const next = new Set(prev);
        toUnprotect.forEach(id => next.delete(id));
        localStorage.setItem(LOCKED_IDS_KEY, JSON.stringify([...next]));
        return next;
      });
    }

    deleteMany(deletable);
    exitSelectionMode();
    showToast(`${deletable.length} thought${deletable.length !== 1 ? "s" : ""} deleted`);
  }

  function handleExportSelected() {
    const exportable = Array.from(selectedIds);
    if (exportable.length === 0) { showToast("No thoughts selected"); return; }
    const bulk: BulkExport = { version: "bulk-2", exportedAt: new Date().toISOString(), thoughts: exportable.map((id) => exportThought(id)) };
    const blob = new Blob([JSON.stringify(bulk, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `thoughts-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast(`${exportable.length} thought${exportable.length !== 1 ? "s" : ""} exported`);
    exitSelectionMode();
  }

  function exitSelectionMode() { setSelectionMode(false); setSelectedIds(new Set()); }

  function startLongPress(id: string, e: React.PointerEvent) {
    if (reorderMode) return;
    longPressOrigin.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      setSelectionMode(true);
      setSelectedIds(new Set([id]));
      setShowOverflow(false);
      try { navigator.vibrate?.(50); } catch { }
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressOrigin.current = null;
  }
  function checkLongPressMove(e: React.PointerEvent) {
    if (!longPressOrigin.current) return;
    const dx = e.clientX - longPressOrigin.current.x;
    const dy = e.clientY - longPressOrigin.current.y;
    if (dx * dx + dy * dy > 64) cancelLongPress();
  }

  function handleColorChange(rootId: string, color: string | null) {
    const next = { ...colorsMap };
    if (color) next[rootId] = color; else delete next[rootId];
    setColorsMap(next);
    localStorage.setItem(COLORS_KEY, JSON.stringify(next));
    setColorPickerRootId(null);
  }

  function handleCopyShare(rootId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const data = exportThought(rootId);
    const url = buildShareUrl(data);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(rootId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function handleVaultButtonClick() {
    setShowVaultMenu(false);
    if (!globalLockHash) {
      setVaultError(""); setVaultDialog("set");
    } else if (isVaultLocked) {
      setVaultError(""); setVaultDialog("unlock");
    } else {
      setShowVaultMenu((s) => !s);
    }
  }

  async function handleVaultPinConfirm(pin: string) {
    if (!vaultDialog) return;
    setVaultError("");
    if (vaultDialog === "set" || vaultDialog === "change-new") {
      const hash = await hashGlobalPin(pin);
      setGlobalLockHash(hash);
      localStorage.setItem(GLOBAL_LOCK_KEY, hash);
      setGlobalUnlocked(true);
      sessionStorage.setItem("diary-vault-unlocked", "1");
      setVaultDialog(null);
      showToast(vaultDialog === "set" ? "Vault PIN set" : "Vault PIN updated");
    } else if (vaultDialog === "unlock") {
      const hash = await hashGlobalPin(pin);
      if (hash === globalLockHash) {
        setGlobalUnlocked(true);
        sessionStorage.setItem("diary-vault-unlocked", "1");
        setVaultDialog(null);
      } else { setVaultError("Incorrect PIN"); }
    } else if (vaultDialog === "change-verify") {
      const hash = await hashGlobalPin(pin);
      if (hash === globalLockHash) { setVaultDialog("change-new"); }
      else { setVaultError("Incorrect PIN"); }
    }
  }

  function handleToggleProtected(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setLockedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      localStorage.setItem(LOCKED_IDS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function handleSearchSelect(nodeId: string, rootId: string) {
    setShowSearch(false);
    const target = nodeId !== rootId ? `/thought/${rootId}?node=${nodeId}` : `/thought/${rootId}`;
    navigate(target);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    const collected: import("../diary/types").ExportData[] = [];
    let failed = 0; let completed = 0;
    function finish() {
      if (collected.length === 0) { showToast(failed > 0 ? "Import failed — invalid file" : "No valid data found"); return; }
      importMany(collected);
      const msg = collected.length === 1 ? `"${firstLine(collected[0].thought.content)}" imported` : `${collected.length} thoughts imported${failed ? `, ${failed} failed` : ""}`;
      showToast(msg);
    }
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (validateBulkExport(data)) { const valid = data.thoughts.filter(validateExportData); failed += data.thoughts.length - valid.length; collected.push(...valid); }
          else if (validateExportData(data)) { collected.push(data); }
          else { failed++; }
        } catch { failed++; }
        completed++;
        if (completed === files.length) finish();
      };
      reader.readAsText(file);
    }
  }

  function handleDragStart(id: string) { setDraggedId(id); }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); if (id !== draggedId) setDragOverId(id); }
  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setRootOrder((prev) => {
      const ids = prev.length ? prev : roots.map((r) => r.id);
      const from = ids.indexOf(draggedId); const to = ids.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...ids]; next.splice(from, 1); next.splice(to, 0, draggedId);
      localStorage.setItem("diary-root-order", JSON.stringify(next));
      return next;
    });
    setDraggedId(null); setDragOverId(null);
  }
  function handleDragEnd() { setDraggedId(null); setDragOverId(null); }

  const displayedRoots = roots.filter(r => !isLocked(r.id));

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-[#0a0a0b]">
      <input ref={importInputRef} type="file" accept=".json" multiple className="hidden" onChange={handleImportFile} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-gray-50/90 dark:bg-[#0a0a0b]/90 backdrop-blur-md border-b border-gray-200/70 dark:border-gray-800/70">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5 mr-auto min-w-0">
            <div className="w-7 h-7 rounded-lg bg-violet-600 dark:bg-violet-500 flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-50 text-[14px] tracking-tight">Thoughts</span>

          </div>

          {selectionMode ? (
            /* ── Selection mode toolbar ── */
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300 mr-1">
                {selectedIds.size} selected
              </span>
              {/* Export selected */}
              <button
                onClick={() => selectedIds.size > 0 && setShowExportConfirm(true)}
                disabled={selectedIds.size === 0}
                title="Export selected"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${selectedIds.size > 0 ? "text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20" : "text-gray-300 dark:text-gray-700 cursor-not-allowed"}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              {/* Delete selected */}
              <button
                onClick={() => selectedIds.size > 0 && setShowDeleteConfirm(true)}
                disabled={selectedIds.size === 0}
                title="Delete selected"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${selectedIds.size > 0 ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" : "text-gray-300 dark:text-gray-700 cursor-not-allowed"}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
              {/* Exit selection */}
              <button onClick={exitSelectionMode} title="Cancel"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ml-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {/* ── Desktop-only icons ── */}
              <button onClick={() => importInputRef.current?.click()} title="Import thoughts"
                className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              </button>
              <button onClick={() => { seedThoughts(SEED_THOUGHTS); showToast("Sample thoughts loaded"); }} title="Load demo data"
                className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              </button>

              {/* Vault lock — always visible */}
              <div className="relative" ref={vaultMenuRef}>
                <button
                  onClick={handleVaultButtonClick}
                  title={!globalLockHash ? "Set vault PIN" : isVaultLocked ? "Unlock vault" : "Vault unlocked"}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isVaultLocked
                    ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    : globalLockHash
                      ? "text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                    }`}
                >
                  {isVaultLocked
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                  }
                </button>
                {showVaultMenu && (
                  <>
                    <div className="absolute right-0 top-9 z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-35 anim-pop-in">
                      <button onClick={() => { setShowVaultMenu(false); setGlobalUnlocked(false); sessionStorage.removeItem("diary-vault-unlocked"); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Lock vault
                      </button>
                      <button onClick={() => { setShowVaultMenu(false); setVaultError(""); setVaultDialog("change-verify"); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Change PIN
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Trash — desktop only */}
              <button onClick={() => navigate("/trash")} title="Trash"
                className="relative hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {trashCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-400 dark:bg-gray-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {trashCount > 9 ? "9+" : trashCount}
                  </span>
                )}
              </button>

              {/* Reorder — desktop only */}
              {displayedRoots.length > 1 && (
                <button
                  onClick={() => { setReorderMode((s) => !s); if (selectionMode) exitSelectionMode(); }}
                  title={reorderMode ? "Done reordering" : "Reorder thoughts"}
                  className={`hidden sm:flex w-8 h-8 items-center justify-center rounded-lg transition-colors ${reorderMode ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              )}

              {/* Select — desktop only */}
              {displayedRoots.length > 0 && (
                <button
                  onClick={() => { setSelectionMode((s) => !s); setSelectedIds(new Set()); if (reorderMode) setReorderMode(false); }}
                  title="Select thoughts"
                  className={`hidden sm:flex w-8 h-8 items-center justify-center rounded-lg transition-colors ${selectionMode ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l3 3 5-5" /></svg>
                </button>
              )}

              {/* Search — always visible */}
              <button onClick={() => setShowSearch(true)} title="Search (Ctrl+K)"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>

              {/* Theme — desktop only */}
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const w = 244;
                  setThemePickerPos({ top: rect.bottom + 8, left: Math.max(4, Math.min(rect.left, window.innerWidth - w - 4)) });
                  setShowThemePicker((s) => !s);
                }}
                title="Appearance"
                className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" /></svg>
              </button>

              {/* ⋯ Overflow — mobile only */}
              <div className="relative flex sm:hidden" ref={overflowRef}>
                <button
                  onClick={() => setShowOverflow((s) => !s)}
                  title="More"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
                {showOverflow && (
                  <div className="absolute right-0 top-9 z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-44 anim-pop-in">
                    <button onClick={() => { setShowOverflow(false); importInputRef.current?.click(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      Import
                    </button>
                    <button onClick={() => { setShowOverflow(false); navigate("/trash"); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="relative shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        {trashCount > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-gray-400 dark:bg-gray-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">{trashCount > 9 ? "9+" : trashCount}</span>}
                      </div>
                      Trash
                    </button>
                    {displayedRoots.length > 1 && (
                      <button onClick={() => { setShowOverflow(false); setReorderMode((s) => !s); if (selectionMode) exitSelectionMode(); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${reorderMode ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        Reorder
                      </button>
                    )}
                    {displayedRoots.length > 0 && (
                      <button onClick={() => { setShowOverflow(false); setSelectionMode((s) => !s); setSelectedIds(new Set()); if (reorderMode) setReorderMode(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${selectionMode ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l3 3 5-5" /></svg>
                        Select
                      </button>
                    )}
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
                    <button
                      onClick={(e) => {
                        setShowOverflow(false);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const w = 244;
                        setThemePickerPos({ top: rect.bottom + 8, left: Math.max(4, Math.min(rect.left, window.innerWidth - w - 4)) });
                        setShowThemePicker(true);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" /></svg>
                      Appearance
                    </button>
                    <button onClick={() => { setShowOverflow(false); seedThoughts(SEED_THOUGHTS); showToast("Sample thoughts loaded"); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                      Load demo
                    </button>
                  </div>
                )}
              </div>

              {/* New — desktop only (mobile uses FAB) */}
              <button onClick={handleCreateRoot} title="New thought"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm ml-0.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New
              </button>
            </div>
          )}
        </div>
        {/* Reorder mode banner */}
        {reorderMode && (
          <div className="max-w-5xl mx-auto px-4 pb-2 flex items-center gap-2">
            <span className="text-xs text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
              Drag cards to reorder
            </span>
            <button onClick={() => setReorderMode(false)} className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors font-medium">Done</button>
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="max-w-5xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {!hydrated ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-gray-200/60 dark:bg-gray-800/40 animate-pulse" />
            ))}
          </div>
        ) : displayedRoots.length === 0 && roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center anim-fade-up">
            <div className="w-20 h-20 rounded-3xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-6 shadow-sm">
              <svg className="w-9 h-9 text-violet-400 dark:text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Your mind is a blank canvas</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-8 max-w-sm leading-relaxed">
              Capture ideas, plans, and reflections as beautiful tree structures
            </p>
            <div className="flex items-center gap-3">
              <button onClick={handleCreateRoot}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Create first thought
              </button>
              <button onClick={() => { seedThoughts(SEED_THOUGHTS); showToast("Sample thoughts loaded"); }}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors shadow-sm">
                Load demo
              </button>
            </div>
          </div>
        ) : displayedRoots.length === 0 && isVaultLocked ? (
          <div className="flex flex-col items-center justify-center py-24 text-center anim-fade-up">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">All thoughts are locked</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Unlock the vault to access them</p>
            <button onClick={() => { setVaultError(""); setVaultDialog("unlock"); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
              Unlock vault
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedRoots.map((root) => {
              const protected_ = isProtected(root.id);
              const isDragging = draggedId === root.id;
              const isDragOver = dragOverId === root.id;
              const isSelected = selectedIds.has(root.id);
              const labelHex = LABEL_COLORS.find((c) => c.id === colorsMap[root.id])?.hex;
              const dateStr = formatDate(root.updatedAt ?? root.createdAt);

              return (
                <div
                  key={root.id}
                  draggable={reorderMode}
                  onDragStart={reorderMode ? () => handleDragStart(root.id) : undefined}
                  onDragOver={reorderMode ? (e) => handleDragOver(e, root.id) : undefined}
                  onDrop={reorderMode ? () => handleDrop(root.id) : undefined}
                  onDragEnd={reorderMode ? handleDragEnd : undefined}
                  onPointerDown={(e) => startLongPress(root.id, e)}
                  onPointerMove={checkLongPressMove}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onClick={
                    selectionMode
                      ? () => setSelectedIds((prev) => { const n = new Set(prev); n.has(root.id) ? n.delete(root.id) : n.add(root.id); return n; })
                      : reorderMode
                        ? undefined
                        : () => handleSelectRoot(root.id)
                  }
                  className={[
                    "group relative flex flex-col rounded-2xl border bg-white dark:bg-gray-900 select-none",
                    "transition-all duration-150",
                    reorderMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                    isDragging ? "opacity-40 scale-95" : "",
                    isDragOver ? "ring-2 ring-violet-400 dark:ring-violet-500 scale-[1.02]" : "",
                    selectionMode && isSelected
                      ? "border-violet-400 dark:border-violet-500 ring-2 ring-violet-400/30 dark:ring-violet-500/30"
                      : !isDragOver ? "border-gray-200/80 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {/* Color strip */}
                  {labelHex && (
                    <div className="h-1 rounded-t-2xl w-full" style={{ background: labelHex }} />
                  )}

                  <div className="flex flex-col flex-1 p-4">
                    {/* Title row */}
                    <div className="flex items-start gap-2 mb-2">
                      {/* Checkbox (selection mode) or drag handle (reorder mode) */}
                      {selectionMode && (
                        <span className={`shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-violet-500 border-violet-500" : "border-gray-300 dark:border-gray-600"}`}>
                          {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                      )}
                      {reorderMode && (
                        <span className="shrink-0 mt-1 text-gray-300 dark:text-gray-700">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                        </span>
                      )}
                      <h3 className="flex-1 font-semibold text-[15px] text-gray-900 dark:text-gray-50 leading-snug line-clamp-2">
                        {firstLine(root.content) || <span className="italic text-gray-400 dark:text-gray-600 font-normal">Untitled</span>}
                      </h3>
                      {protected_ && (
                        <span className="shrink-0 mt-0.5" title="Protected by vault">
                          <svg className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </span>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-xs text-gray-400 dark:text-gray-500">{dateStr}</span>

                      {/* Quick actions — only when no special mode active */}
                      {!selectionMode && !reorderMode && (
                        <div className="ml-auto flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleCopyShare(root.id, e)}
                            title="Copy share link"
                            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${copiedId === root.id ? "text-green-500" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                          >
                            {copiedId === root.id
                              ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            }
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const w = 200;
                              const left = Math.max(4, Math.min(rect.left - 80, window.innerWidth - w - 4));
                              setColorPickerPos({ top: rect.bottom + 6, left });
                              setColorPickerRootId(colorPickerRootId === root.id ? null : root.id);
                            }}
                            title="Label color"
                            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                            style={{ color: labelHex }}
                          >
                            <svg className={`w-3 h-3 ${labelHex ? "" : "text-gray-400 dark:text-gray-500"}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.53-.2-1.01-.52-1.38-.31-.36-.49-.84-.49-1.32 0-1.1.9-2 2-2h2.36c3.09 0 5.65-2.56 5.65-5.65C22.99 6.01 17.99 2 12 2z" /></svg>
                          </button>
                          {/* Vault protection toggle */}
                          <button
                            onClick={(e) => handleToggleProtected(e, root.id)}
                            title={protected_ ? "Remove from vault" : "Add to vault"}
                            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${protected_ ? "text-amber-500 hover:text-amber-600" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                          >
                            {protected_
                              ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            }
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendingDeleteId(root.id); }}
                            title="Delete"
                            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Mobile FAB: New thought ── */}
      {!selectionMode && !reorderMode && (
        <button
          onClick={handleCreateRoot}
          title="New thought"
          className="sm:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold rounded-full shadow-lg transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New thought
        </button>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 text-sm font-medium rounded-full shadow-xl anim-fade-up pointer-events-none">
          <svg className="w-3.5 h-3.5 text-green-400 dark:text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}

      {/* ── Confirm dialogs ── */}
      {pendingDeleteId && (
        <ConfirmDialog
          message="Delete this thought? It will move to Trash."
          onConfirm={() => { handleDeleteRoot(pendingDeleteId); setPendingDeleteId(null); }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Delete ${selectedIds.size} thought${selectedIds.size !== 1 ? "s" : ""}? They will move to Trash.`}
          onConfirm={() => { setShowDeleteConfirm(false); handleDeleteSelected(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showExportConfirm && (
        <ConfirmDialog
          message={`Export ${selectedIds.size} thought${selectedIds.size !== 1 ? "s" : ""} as a JSON backup file?`}
          onConfirm={() => { setShowExportConfirm(false); handleExportSelected(); }}
          onCancel={() => setShowExportConfirm(false)}
        />
      )}

      {showSearch && (
        <SearchDialog
          nodes={nodes}
          lockedRootIds={isVaultLocked ? new Set(Array.from(lockedIds)) : new Set()}
          onSelect={handleSearchSelect}
          onClose={() => setShowSearch(false)}
        />
      )}

      {vaultDialog && (
        <PinDialog
          key={vaultDialog}
          mode={vaultDialog}
          externalError={vaultError || undefined}
          onConfirm={handleVaultPinConfirm}
          onCancel={() => { setVaultDialog(null); setVaultError(""); }}
          onChangePinRequest={vaultDialog === "unlock" ? () => { setVaultError(""); setVaultDialog("change-verify"); } : undefined}
        />
      )}

      {colorPickerRootId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColorPickerRootId(null)} />
          <div
            className="fixed z-50 flex items-center gap-2 p-2.5 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex-wrap anim-pop-in"
            style={{ top: colorPickerPos.top, left: colorPickerPos.left, maxWidth: "calc(100vw - 8px)" }}
          >
            {LABEL_COLORS.map((c) => (
              <button key={c.id} onClick={() => handleColorChange(colorPickerRootId, c.id)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 shrink-0 shadow-sm"
                style={{ background: c.hex, outline: colorsMap[colorPickerRootId] === c.id ? `2px solid ${c.hex}` : "none", outlineOffset: "2px" }}
              />
            ))}
            <button onClick={() => handleColorChange(colorPickerRootId, null)}
              className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors shrink-0">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </>
      )}

      {/* Theme picker */}
      {showThemePicker && createPortal(
        <>
          <div className="fixed inset-0 z-200" onClick={() => setShowThemePicker(false)} />
          <div
            className="fixed z-201 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 anim-pop-in"
            style={{ top: themePickerPos.top, left: themePickerPos.left, width: 244 }}
          >
            <div className="flex gap-1.5 mb-3">
              <button onClick={() => { setIsDark(false); applyColor(colorId, false); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${!isDark ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" strokeWidth="2" /><path strokeLinecap="round" strokeWidth="2" d="M12 2v2m0 16v2M2 12h2m16 0h2m-3.5-7.5-1.5 1.5m-9 9-1.5 1.5m0-12 1.5 1.5m9 9 1.5 1.5" /></svg>
                Light
              </button>
              <button onClick={() => { setIsDark(true); applyColor(colorId, true); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${isDark ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                Dark
              </button>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <div className="grid grid-cols-4 gap-1">
                {ACCENT_COLORS.map((c) => {
                  const active = colorId === c.id;
                  return (
                    <button key={c.id} title={c.name} onClick={() => { setColorId(c.id); applyColor(c.id, isDark); }}
                      className={`flex flex-col items-center gap-1.5 py-2 rounded-xl transition-all ${active ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}>
                      <span className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm" style={{ background: c.hex, outline: active ? `2px solid ${c.hex}` : "none", outlineOffset: "2px" }}>
                        {active && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <span className={`text-[9px] leading-none ${active ? "font-semibold text-gray-800 dark:text-gray-100" : "font-medium text-gray-400 dark:text-gray-500"}`}>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
