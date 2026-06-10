import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useNodes } from "../diary/useNodes";
import { NoteTree, firstLine } from "../diary/NoteTree";
import { PinDialog } from "../diary/PinDialog";
import { SearchDialog } from "../diary/SearchDialog";
import { MoveDialog } from "../diary/MoveDialog";
import { ConfirmDialog } from "../diary/ConfirmDialog";
import { buildShareUrl } from "../diary/share";
import type { Route } from "./+types/thought.$id";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: "Thought" }, { name: "description", content: `Thought ${params.id}` }];
}

const COLORS_KEY = "diary-colors";
const GLOBAL_LOCK_KEY = "diary-global-lock-hash";
const LOCKED_IDS_KEY = "diary-locked-ids";

async function hashGlobalPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`vault:${pin}:diary-lock`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ThoughtDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    nodes,
    hydrated,
    lastSavedAt,
    updateNode,
    createNode,
    deleteNode,
    deleteNodeOnly,
    moveNode,
    exportThought,
    replaceThought,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useNodes();

  const rootId = id!;

  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Toolbar signals ──
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal] = useState(0);
  const [hideSignal, setHideSignal] = useState(0);
  const [revealSignal, setRevealSignal] = useState(0);
  const [scrollToId, setScrollToId] = useState<string | null>(null);

  // ── Mode toggles ──
  const [dragMode, setDragMode] = useState(false);
  const [nodeSelectionMode, setNodeSelectionMode] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [anyHidden, setAnyHidden] = useState(false);
  const [showDeleteNodesConfirm, setShowDeleteNodesConfirm] = useState(false);

  // ── Vault state ──
  const [globalLockHash, setGlobalLockHash] = useState<string | null>(null);
  const [globalUnlocked, setGlobalUnlocked] = useState(true);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [vaultDialog, setVaultDialog] = useState<"unlock" | "set" | "change-verify" | "change-new" | null>(null);
  const [vaultError, setVaultError] = useState("");

  // ── Search ──
  const [showSearch, setShowSearch] = useState(false);

  // ── Move ──
  const [moveNodeId, setMoveNodeId] = useState<string | null>(null);

  // ── Toast ──
  const [toast, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-save indicator ──
  const [savedRecently, setSavedRecently] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Colors ──
  const [colorsMap, setColorsMap] = useState<Record<string, string>>({});
  const labelHex = (() => {
    const LABEL_COLORS: Record<string, string> = {
      red: "#f87171", orange: "#fb923c", yellow: "#facc15", green: "#4ade80",
      teal: "#2dd4bf", blue: "#60a5fa", purple: "#a78bfa", pink: "#f472b6",
    };
    const cid = colorsMap[rootId];
    return cid ? LABEL_COLORS[cid] : undefined;
  })();

  useEffect(() => {
    try { const r = localStorage.getItem(COLORS_KEY); if (r) setColorsMap(JSON.parse(r)); } catch { }
    const hash = localStorage.getItem(GLOBAL_LOCK_KEY);
    setGlobalLockHash(hash);
    if (!hash) { setGlobalUnlocked(true); } else { setGlobalUnlocked(sessionStorage.getItem("diary-vault-unlocked") === "1"); }
    try { const r = localStorage.getItem(LOCKED_IDS_KEY); if (r) setLockedIds(new Set(JSON.parse(r))); } catch { }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setShowSearch((s) => !s); }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  useEffect(() => {
    if (!lastSavedAt) return;
    setSavedRecently(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedRecently(false), 2500);
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
  }, [lastSavedAt]);

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3500);
  }

  const root = nodes[rootId];
  const isVaultLocked = !!globalLockHash && !globalUnlocked;
  const isProtected = lockedIds.has(rootId);
  const thoughtIsLocked = isProtected && isVaultLocked;

  // ── Not found (after hydration) ──
  if (hydrated && !root) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-[#0a0a0b] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 dark:text-gray-500 text-sm">Thought not found</p>
        <button onClick={() => navigate("/")}
          className="px-4 py-2 text-sm font-medium rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors">
          Back to Thoughts
        </button>
      </div>
    );
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

  function handleToggleProtected() {
    setLockedIds(prev => {
      const next = new Set(prev);
      if (next.has(rootId)) { next.delete(rootId); } else { next.add(rootId); }
      localStorage.setItem(LOCKED_IDS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function handleExport() {
    const data = exportThought(rootId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${firstLine(root?.content || "thought") || "thought"}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function handleShare() {
    const data = exportThought(rootId);
    const url = buildShareUrl(data);
    navigator.clipboard.writeText(url).then(() => showToast("Share link copied!"));
  }

  function handleDeleteSelectedConfirmed() {
    for (const nid of selectedNodeIds) {
      if (nid === rootId) continue;
      deleteNode(nid);
    }
    setSelectedNodeIds(new Set());
    setNodeSelectionMode(false);
  }

  function handleSearchSelect(_nodeId: string, foundRootId: string) {
    setShowSearch(false);
    if (foundRootId !== rootId) navigate(`/thought/${foundRootId}`);
    else setScrollToId(_nodeId);
  }

  const title = root ? (firstLine(root.content) || "Untitled") : "…";

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-[#0a0a0b] flex flex-col">
      {/* ── Header ── */}
      <header ref={headerRef} className="sticky top-0 z-20 bg-gray-50/90 dark:bg-[#0a0a0b]/90 backdrop-blur-md border-b border-gray-200/70 dark:border-gray-800/70">
        {/* Color strip if labeled */}
        {labelHex && <div className="h-0.5 w-full" style={{ background: labelHex }} />}

        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-x-1 min-h-12">
          {/* Back */}
          <button onClick={() => navigate("/")} title="Back to all thoughts"
            className="cursor-pointer flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors shrink-0 mr-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>

          </button>

          {/* Scrollable toolbar area */}
          <div className="flex-1 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

            {/* Toolbar — only when accessible */}
            {!thoughtIsLocked && root && (
              <div className="flex items-center gap-x-0.5 justify-end">
                {/* Undo / Redo */}
                <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${canUndo ? "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800" : "text-gray-200 dark:text-gray-700 cursor-not-allowed"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                </button>
                <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${canRedo ? "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800" : "text-gray-200 dark:text-gray-700 cursor-not-allowed"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                </button>

                <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5 self-center" />

                {/* Collapse / Expand */}
                <button onClick={() => setCollapseSignal((s) => s + 1)} title="Collapse all"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <button onClick={() => setExpandSignal((s) => s + 1)} title="Expand all"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {anyHidden && (
                  <button onClick={() => setRevealSignal((s) => s + 1)} title="Reveal hidden"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </button>
                )}

                <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5 self-center" />

                {/* Drag mode */}
                <button onClick={() => { setDragMode((s) => !s); if (nodeSelectionMode) setNodeSelectionMode(false); }}
                  title="Drag to reorder"
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${dragMode ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                </button>

                {/* Select mode — checkbox icon */}
                <button onClick={() => { setNodeSelectionMode((s) => !s); if (dragMode) setDragMode(false); if (nodeSelectionMode) setSelectedNodeIds(new Set()); }}
                  title="Select nodes"
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${nodeSelectionMode ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l3 3 5-5" /></svg>
                </button>

                {nodeSelectionMode && selectedNodeIds.size > 0 && (
                  <button onClick={() => setShowDeleteNodesConfirm(true)} title="Delete selected nodes"
                    className="flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    {selectedNodeIds.size}
                  </button>
                )}

                <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5 self-center" />

                {/* Search */}
                <button onClick={() => setShowSearch(true)} title="Search (Ctrl+K)"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>

                {/* Share */}
                <button onClick={handleShare} title="Copy share link"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                </button>

                {/* Export */}
                <button onClick={handleExport} title="Export as JSON"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>

                {/* Vault protection toggle */}
                <button
                  onClick={handleToggleProtected}
                  title={isProtected ? "Remove from vault" : "Add to vault"}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isProtected ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"}`}
                >
                  {isProtected
                    ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                  }
                </button>

                {/* Auto-save indicator */}
                {savedRecently && (
                  <span className="text-xs text-gray-400 dark:text-gray-600 anim-fade-up flex items-center gap-1 ml-1">
                    <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Saved
                  </span>
                )}
              </div>
            )}

            {/* Unlock button if vault locked */}
            {thoughtIsLocked && (
              <div className="flex justify-end">
                <button onClick={() => { setVaultError(""); setVaultDialog("unlock"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                  Unlock vault
                </button>
              </div>
            )}
          </div>{/* end scrollable toolbar area */}
        </div>
      </header>

      {/* ── Tree content ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-2 sm:px-4">
        {!hydrated ? (
          <div className="py-12 flex flex-col gap-4 px-6">
            {[80, 60, 90, 50].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse shrink-0" />
                <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        ) : thoughtIsLocked ? (
          <div className="flex flex-col items-center justify-center py-32 text-center anim-fade-up">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">This thought is in the vault</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Unlock the vault to view it</p>
            <button onClick={() => { setVaultError(""); setVaultDialog("unlock"); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
              Unlock vault
            </button>
          </div>
        ) : root ? (
          <NoteTree
            rootId={rootId}
            nodes={nodes}
            initialEditId={null}
            collapseSignal={collapseSignal}
            expandSignal={expandSignal}
            hideSignal={hideSignal}
            revealSignal={revealSignal}
            scrollToId={scrollToId}
            onUpdate={updateNode}
            onCreateChild={(parentId) => createNode("", parentId)}
            onDelete={deleteNode}
            onDeleteKeepChildren={deleteNodeOnly}
            onMove={(nodeId) => setMoveNodeId(nodeId)}
            onReparent={(nodeId, newParentId) => {
              if (newParentId === null || newParentId === rootId) {
                moveNode(nodeId, newParentId);
              } else {
                moveNode(nodeId, newParentId);
              }
            }}
            onAnyHiddenChange={setAnyHidden}
            dragMode={dragMode}
            nodeSelectionMode={nodeSelectionMode}
            selectedNodeIds={selectedNodeIds}
            stickyOffset={headerHeight}
            onNodeToggleSelect={(nid) => setSelectedNodeIds((prev) => {
              const n = new Set(prev);
              n.has(nid) ? n.delete(nid) : n.add(nid);
              return n;
            })}
          />
        ) : null}
      </main>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 text-sm font-medium rounded-full shadow-xl anim-fade-up pointer-events-none">
          <svg className="w-3.5 h-3.5 text-green-400 dark:text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}

      {/* ── Dialogs ── */}
      {showDeleteNodesConfirm && (
        <ConfirmDialog
          message={`Delete ${selectedNodeIds.size} node${selectedNodeIds.size !== 1 ? "s" : ""}? This cannot be undone.`}
          onConfirm={() => { setShowDeleteNodesConfirm(false); handleDeleteSelectedConfirmed(); }}
          onCancel={() => setShowDeleteNodesConfirm(false)}
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

      {showSearch && (
        <SearchDialog
          nodes={nodes}
          lockedRootIds={new Set()}
          onSelect={handleSearchSelect}
          onClose={() => setShowSearch(false)}
        />
      )}

      {moveNodeId && (
        <MoveDialog
          nodeId={moveNodeId}
          nodes={nodes}
          onMove={(targetId) => { moveNode(moveNodeId, targetId); setMoveNodeId(null); }}
          onClose={() => setMoveNodeId(null)}
        />
      )}
    </div>
  );
}
