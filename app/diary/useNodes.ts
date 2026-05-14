import { useState, useCallback, useEffect, useRef } from "react";
import type { DiaryNode, ExportData, ExportedNode, NodesMap } from "./types";

const STORAGE_KEY = "diary-nodes";

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

export function useNodes() {
  const [nodes, setNodes] = useState<NodesMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<NodesMap[]>([]);
  const redoRef = useRef<NodesMap[]>([]);
  // Stays in sync with the latest nodes value without stale-closure issues
  const nodesRef = useRef<NodesMap>({});
  nodesRef.current = nodes;

  useEffect(() => {
    const stored = loadFromStorage();
    if (Object.keys(stored).length > 0) setNodes(stored);
    setHydrated(true);
  }, []);

  const persist = useCallback((updated: NodesMap) => {
    setNodes(updated);
    saveToStorage(updated);
    setLastSavedAt(Date.now());
  }, []);

  const pushHistory = useCallback((snapshot: NodesMap) => {
    historyRef.current = [...historyRef.current.slice(-29), snapshot];
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current.slice(-29), nodesRef.current];
    setNodes(prev);
    saveToStorage(prev);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current.slice(-29), nodesRef.current];
    setNodes(next);
    saveToStorage(next);
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const createNode = useCallback(
    (content: string, parentId: string | null): string => {
      const id = generateId();
      pushHistory(nodes);
      persist({ ...nodes, [id]: { id, content, parentId, createdAt: new Date().toISOString() } });
      return id;
    },
    [nodes, persist, pushHistory]
  );

  const updateNode = useCallback(
    (id: string, content: string) => {
      if (!nodes[id]) return;
      pushHistory(nodes);
      persist({ ...nodes, [id]: { ...nodes[id], content, updatedAt: new Date().toISOString() } });
    },
    [nodes, persist, pushHistory]
  );

  const deleteNode = useCallback(
    (id: string) => {
      const toDelete = new Set<string>();
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.pop()!;
        toDelete.add(current);
        for (const n of Object.values(nodes)) {
          if (n.parentId === current) queue.push(n.id);
        }
      }
      pushHistory(nodes);
      const updated = { ...nodes };
      toDelete.forEach((nid) => delete updated[nid]);
      persist(updated);
    },
    [nodes, persist, pushHistory]
  );

  const deleteNodeOnly = useCallback(
    (id: string) => {
      const node = nodes[id];
      if (!node) return;
      pushHistory(nodes);
      const updated = { ...nodes };
      for (const n of Object.values(updated)) {
        if (n.parentId === id) {
          updated[n.id] = { ...n, parentId: node.parentId };
        }
      }
      delete updated[id];
      persist(updated);
    },
    [nodes, persist, pushHistory]
  );

  const deleteMany = useCallback(
    (ids: string[]) => {
      const toDelete = new Set<string>();
      for (const id of ids) {
        const queue = [id];
        while (queue.length > 0) {
          const current = queue.pop()!;
          toDelete.add(current);
          for (const n of Object.values(nodes)) {
            if (n.parentId === current) queue.push(n.id);
          }
        }
      }
      pushHistory(nodes);
      const updated = { ...nodes };
      toDelete.forEach((nid) => delete updated[nid]);
      persist(updated);
    },
    [nodes, persist, pushHistory]
  );

  const exportThought = useCallback(
    (id: string): ExportData => {
      function buildTree(nodeId: string): ExportedNode {
        const node = nodes[nodeId];
        const children = Object.values(nodes)
          .filter((n) => n.parentId === nodeId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((c) => buildTree(c.id));
        return { content: node.content, createdAt: node.createdAt, children };
      }
      return { version: 2, exportedAt: new Date().toISOString(), thought: buildTree(id) };
    },
    [nodes]
  );

  const importThought = useCallback(
    (data: ExportData, parentId: string | null): string => {
      const newNodes = { ...nodes };
      function insertTree(exported: ExportedNode, parent: string | null): string {
        const id = generateId();
        newNodes[id] = { id, content: exported.content, parentId: parent, createdAt: exported.createdAt };
        for (const child of exported.children) insertTree(child, id);
        return id;
      }
      pushHistory(nodes);
      const rootId = insertTree(data.thought, parentId);
      persist(newNodes);
      return rootId;
    },
    [nodes, persist, pushHistory]
  );

  const replaceThought = useCallback(
    (existingRootId: string, data: ExportData): string => {
      const updated = { ...nodes };
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
      pushHistory(nodes);
      const newRootId = insertTree(data.thought, null);
      persist(updated);
      return newRootId;
    },
    [nodes, persist, pushHistory]
  );

  const importMany = useCallback(
    (dataList: ExportData[]): string[] => {
      const newNodes = { ...nodes };
      const rootIds: string[] = [];
      function insertTree(exported: ExportedNode, parent: string | null): string {
        const id = generateId();
        newNodes[id] = { id, content: exported.content, parentId: parent, createdAt: exported.createdAt };
        for (const child of exported.children) insertTree(child, id);
        return id;
      }
      pushHistory(nodes);
      for (const data of dataList) rootIds.push(insertTree(data.thought, null));
      persist(newNodes);
      return rootIds;
    },
    [nodes, persist, pushHistory]
  );

  const moveNode = useCallback(
    (nodeId: string, newParentId: string | null) => {
      if (!nodes[nodeId]) return;
      pushHistory(nodes);
      persist({ ...nodes, [nodeId]: { ...nodes[nodeId], parentId: newParentId, updatedAt: new Date().toISOString() } });
    },
    [nodes, persist, pushHistory]
  );

  const seedThoughts = useCallback(
    (roots: ExportedNode[]) => {
      const newNodes = { ...nodes };
      function insert(exported: ExportedNode, parent: string | null): void {
        const id = generateId();
        newNodes[id] = { id, content: exported.content, parentId: parent, createdAt: exported.createdAt };
        for (const child of exported.children) insert(child, id);
      }
      for (const root of roots) insert(root, null);
      persist(newNodes);
    },
    [nodes, persist]
  );

  return { nodes, hydrated, lastSavedAt, createNode, updateNode, deleteNode, deleteNodeOnly, deleteMany, moveNode, exportThought, importThought, importMany, replaceThought, undo, redo, canUndo, canRedo, seedThoughts };
}
