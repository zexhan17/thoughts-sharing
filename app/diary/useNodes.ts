import { useState, useCallback, useEffect, useRef } from "react";
import type { DiaryNode, ExportData, ExportedNode, NodesMap } from "./types";
import { pb } from "../lib/pb";

const STORAGE_KEY = "diary-nodes";
const PB_ID_MAP_KEY = "pb-id-map";
const SYNC_DEBOUNCE_MS = 1500;

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// localId → pbRecordId  (persisted across sessions)
function loadPbIdMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PB_ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePbIdMap(map: Record<string, string>) {
  localStorage.setItem(PB_ID_MAP_KEY, JSON.stringify(map));
}

function loadFromStorage(): NodesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, any>;
    const result: NodesMap = {};
    for (const [id, n] of Object.entries(parsed)) {
      let content: string = n.content ?? "";
      if ("title" in n && typeof n.title === "string" && n.title) {
        content = n.title + (content ? "\n\n" + content : "");
      }
      result[id] = {
        id: n.id ?? id,
        content,
        parentId: n.parentId ?? null,
        createdAt: n.createdAt ?? new Date().toISOString(),
        updatedAt: n.updatedAt,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function saveToStorage(nodes: NodesMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
}

// Diffs prev → next and applies the minimum set of PocketBase operations.
// parentId values in PocketBase are our local IDs (plain text field).
async function applyDiff(
  prev: NodesMap,
  next: NodesMap,
  pbIdMap: Record<string, string>,
): Promise<{ map: Record<string, string>; hasErrors: boolean }> {
  if (!pb.authStore.isValid) return { map: pbIdMap, hasErrors: false };
  const userId = pb.authStore.record?.id;
  if (!userId) return { map: pbIdMap, hasErrors: false };

  const updatedMap = { ...pbIdMap };
  let hasErrors = false;

  // Collect all ops and run sequentially to avoid races
  const ops: Array<() => Promise<void>> = [];

  for (const localId of Object.keys(next)) {
    if (!prev[localId]) {
      if (!updatedMap[localId]) {
        // Create — capture localId in closure
        const node = next[localId];
        const id = localId;
        ops.push(async () => {
          try {
            const record = await pb.collection('nodes').create({
              content: node.content,
              parentId: node.parentId ?? '',
              user: userId,
            });
            updatedMap[id] = record.id;
          } catch (err) {
            console.warn('PB create failed', id, err);
            hasErrors = true;
          }
        });
      }
    } else if (
      prev[localId].content !== next[localId].content ||
      prev[localId].parentId !== next[localId].parentId
    ) {
      const pbId = pbIdMap[localId];
      if (pbId) {
        const node = next[localId];
        const id = localId;
        ops.push(async () => {
          try {
            await pb.collection('nodes').update(pbId, {
              content: node.content,
              parentId: node.parentId ?? '',
            });
          } catch (err) {
            console.warn('PB update failed', id, err);
            hasErrors = true;
          }
        });
      }
    }
  }

  for (const localId of Object.keys(prev)) {
    if (!next[localId]) {
      const pbId = pbIdMap[localId];
      if (pbId) {
        const id = localId;
        ops.push(async () => {
          try {
            await pb.collection('nodes').delete(pbId);
            delete updatedMap[id];
          } catch (err) {
            console.warn('PB delete failed', id, err);
            hasErrors = true;
          }
        });
      }
    }
  }

  // Run sequentially — no concurrent races, predictable order
  for (const op of ops) await op();

  return { map: updatedMap, hasErrors };
}

export function useNodes() {
  const [nodes, setNodes] = useState<NodesMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');

  const historyRef = useRef<NodesMap[]>([]);
  const redoRef = useRef<NodesMap[]>([]);
  const nodesRef = useRef<NodesMap>({});
  nodesRef.current = nodes;

  // lastSyncedRef: what PocketBase actually has — only advances on confirmed sync
  const lastSyncedRef = useRef<NodesMap>({});
  const pbIdMapRef = useRef<Record<string, string>>(loadPbIdMap());

  // Sync queue state
  const isSyncingRef = useRef(false);
  const syncPendingRef = useRef(false); // another sync requested while one is running
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // doSync — runs one sync cycle, serialized
  const doSync = useCallback(async () => {
    if (isSyncingRef.current) {
      syncPendingRef.current = true;
      return;
    }
    isSyncingRef.current = true;
    setSyncStatus('syncing');

    const base = lastSyncedRef.current;
    const target = nodesRef.current;

    const { map, hasErrors } = await applyDiff(base, target, pbIdMapRef.current);
    pbIdMapRef.current = map;
    savePbIdMap(map);

    if (!hasErrors) {
      lastSyncedRef.current = target;
      setSyncStatus('synced');
    } else {
      setSyncStatus('error');
      // lastSyncedRef stays behind so the next sync retries failed ops
    }

    isSyncingRef.current = false;

    if (syncPendingRef.current) {
      syncPendingRef.current = false;
      doSync();
    }
  }, []); // stable — all deps are refs or stable setters

  // scheduleSync — debounce; marks 'pending' immediately so user sees it
  const scheduleSync = useCallback(() => {
    setSyncStatus('pending');
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(doSync, SYNC_DEBOUNCE_MS);
  }, [doSync]);

  const retrySync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    doSync();
  }, [doSync]);

  // Flush sync when tab becomes hidden (switching tabs, closing window)
  useEffect(() => {
    function onVisibility() {
      if (document.hidden && syncStatus !== 'synced') {
        if (syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        doSync();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [doSync, syncStatus]);

  // Load from PocketBase on mount
  useEffect(() => {
    async function load() {
      if (!pb.authStore.isValid) {
        const stored = loadFromStorage();
        if (Object.keys(stored).length > 0) setNodes(stored);
        setHydrated(true);
        return;
      }

      try {
        const records = await pb.collection('nodes').getFullList({ sort: 'created' });

        if (records.length === 0) {
          // Migrate existing localStorage data if any
          const stored = loadFromStorage();
          if (Object.keys(stored).length > 0) {
            setNodes(stored);
            lastSyncedRef.current = {};
            saveToStorage(stored);
            // Immediately sync (no debounce — migration is a one-time event)
            setSyncStatus('pending');
            setHydrated(true);
            doSync();
            return;
          }
          setHydrated(true);
          return;
        }

        // Build reverse map: pbId → localId
        const reverseMap: Record<string, string> = {};
        for (const [localId, pbId] of Object.entries(pbIdMapRef.current)) {
          reverseMap[pbId] = localId;
        }

        const result: NodesMap = {};
        for (const r of records) {
          const localId = reverseMap[r.id] ?? r.id;
          result[localId] = {
            id: localId,
            content: r['content'] ?? '',
            parentId: r['parentId'] || null,
            createdAt: r['created'],
            updatedAt: r['updated'] || undefined,
          };
          if (!pbIdMapRef.current[localId]) {
            pbIdMapRef.current[localId] = r.id;
          }
        }

        savePbIdMap(pbIdMapRef.current);
        setNodes(result);
        lastSyncedRef.current = result;
        saveToStorage(result);
      } catch {
        // Offline or error — fall back to localStorage
        const stored = loadFromStorage();
        if (Object.keys(stored).length > 0) setNodes(stored);
      }

      setHydrated(true);
    }
    load();
  }, [doSync]);

  const persist = useCallback((updated: NodesMap) => {
    setNodes(updated);
    saveToStorage(updated);      // instant, always
    setLastSavedAt(Date.now());
    scheduleSync();              // debounced network sync
  }, [scheduleSync]);

  const pushHistory = useCallback((snapshot: NodesMap) => {
    historyRef.current = [...historyRef.current.slice(-29), snapshot];
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const target = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current.slice(-29), nodesRef.current];
    persist(target);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }, [persist]);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const target = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current.slice(-29), nodesRef.current];
    persist(target);
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
  }, [persist]);

  const createNode = useCallback(
    (content: string, parentId: string | null): string => {
      const id = generateId();
      const prev = nodesRef.current;
      pushHistory(prev);
      persist({ ...prev, [id]: { id, content, parentId, createdAt: new Date().toISOString() } });
      return id;
    },
    [persist, pushHistory]
  );

  const updateNode = useCallback(
    (id: string, content: string) => {
      const prev = nodesRef.current;
      if (!prev[id]) return;
      pushHistory(prev);
      persist({ ...prev, [id]: { ...prev[id], content, updatedAt: new Date().toISOString() } });
    },
    [persist, pushHistory]
  );

  const deleteNode = useCallback(
    (id: string) => {
      const prev = nodesRef.current;
      const toDelete = new Set<string>();
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.pop()!;
        toDelete.add(current);
        for (const n of Object.values(prev)) {
          if (n.parentId === current) queue.push(n.id);
        }
      }
      pushHistory(prev);
      const updated = { ...prev };
      toDelete.forEach((nid) => delete updated[nid]);
      persist(updated);
    },
    [persist, pushHistory]
  );

  const deleteNodeOnly = useCallback(
    (id: string) => {
      const prev = nodesRef.current;
      const node = prev[id];
      if (!node) return;
      pushHistory(prev);
      const updated = { ...prev };
      for (const n of Object.values(updated)) {
        if (n.parentId === id) updated[n.id] = { ...n, parentId: node.parentId };
      }
      delete updated[id];
      persist(updated);
    },
    [persist, pushHistory]
  );

  const deleteMany = useCallback(
    (ids: string[]) => {
      const prev = nodesRef.current;
      const toDelete = new Set<string>();
      for (const id of ids) {
        const queue = [id];
        while (queue.length > 0) {
          const current = queue.pop()!;
          toDelete.add(current);
          for (const n of Object.values(prev)) {
            if (n.parentId === current) queue.push(n.id);
          }
        }
      }
      pushHistory(prev);
      const updated = { ...prev };
      toDelete.forEach((nid) => delete updated[nid]);
      persist(updated);
    },
    [persist, pushHistory]
  );

  const exportThought = useCallback((id: string): ExportData => {
    const cur = nodesRef.current;
    function buildTree(nodeId: string): ExportedNode {
      const node = cur[nodeId];
      const children = Object.values(cur)
        .filter((n) => n.parentId === nodeId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((c) => buildTree(c.id));
      return { content: node.content, createdAt: node.createdAt, children };
    }
    return { version: 2, exportedAt: new Date().toISOString(), thought: buildTree(id) };
  }, []);

  const importThought = useCallback(
    (data: ExportData, parentId: string | null): string => {
      const prev = nodesRef.current;
      const newNodes = { ...prev };
      function insertTree(exported: ExportedNode, parent: string | null): string {
        const id = generateId();
        newNodes[id] = { id, content: exported.content, parentId: parent, createdAt: exported.createdAt };
        for (const child of exported.children) insertTree(child, id);
        return id;
      }
      pushHistory(prev);
      const rootId = insertTree(data.thought, parentId);
      persist(newNodes);
      return rootId;
    },
    [persist, pushHistory]
  );

  const replaceThought = useCallback(
    (existingRootId: string, data: ExportData): string => {
      const prev = nodesRef.current;
      const updated = { ...prev };
      const queue = [existingRootId];
      while (queue.length > 0) {
        const current = queue.pop()!;
        for (const n of Object.values(updated)) {
          if (n.parentId === current) queue.push(n.id);
        }
        delete updated[current];
      }
      function insertTree(exported: ExportedNode, parent: string | null): string {
        const id = generateId();
        updated[id] = { id, content: exported.content, parentId: parent, createdAt: exported.createdAt };
        for (const child of exported.children) insertTree(child, id);
        return id;
      }
      pushHistory(prev);
      const newRootId = insertTree(data.thought, null);
      persist(updated);
      return newRootId;
    },
    [persist, pushHistory]
  );

  const importMany = useCallback(
    (dataList: ExportData[]): string[] => {
      const prev = nodesRef.current;
      const newNodes = { ...prev };
      const rootIds: string[] = [];
      function insertTree(exported: ExportedNode, parent: string | null): string {
        const id = generateId();
        newNodes[id] = { id, content: exported.content, parentId: parent, createdAt: exported.createdAt };
        for (const child of exported.children) insertTree(child, id);
        return id;
      }
      pushHistory(prev);
      for (const data of dataList) rootIds.push(insertTree(data.thought, null));
      persist(newNodes);
      return rootIds;
    },
    [persist, pushHistory]
  );

  const moveNode = useCallback(
    (nodeId: string, newParentId: string | null) => {
      const prev = nodesRef.current;
      if (!prev[nodeId]) return;
      pushHistory(prev);
      persist({ ...prev, [nodeId]: { ...prev[nodeId], parentId: newParentId, updatedAt: new Date().toISOString() } });
    },
    [persist, pushHistory]
  );

  const seedThoughts = useCallback(
    (roots: ExportedNode[]) => {
      const prev = nodesRef.current;
      const newNodes = { ...prev };
      function insert(exported: ExportedNode, parent: string | null): void {
        const id = generateId();
        newNodes[id] = { id, content: exported.content, parentId: parent, createdAt: exported.createdAt };
        for (const child of exported.children) insert(child, id);
      }
      for (const root of roots) insert(root, null);
      persist(newNodes);
    },
    [persist]
  );

  return {
    nodes, hydrated, lastSavedAt,
    syncStatus, retrySync,
    createNode, updateNode, deleteNode, deleteNodeOnly, deleteMany,
    moveNode, exportThought, importThought, importMany, replaceThought,
    undo, redo, canUndo, canRedo, seedThoughts,
  };
}
