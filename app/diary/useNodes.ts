import { useState, useCallback, useEffect } from "react";
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
      // Migrate old format: separate title + content → single content field
      let content: string = n.content ?? "";
      if ("title" in n && typeof n.title === "string" && n.title) {
        content = n.title + (content ? "\n\n" + content : "");
      }
      result[id] = {
        id: n.id ?? id,
        content,
        parentId: n.parentId ?? null,
        createdAt: n.createdAt ?? new Date().toISOString(),
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

  useEffect(() => {
    const stored = loadFromStorage();
    if (Object.keys(stored).length > 0) setNodes(stored);
    setHydrated(true);
  }, []);

  const persist = useCallback((updated: NodesMap) => {
    setNodes(updated);
    saveToStorage(updated);
  }, []);

  const createNode = useCallback(
    (content: string, parentId: string | null): string => {
      const id = generateId();
      persist({ ...nodes, [id]: { id, content, parentId, createdAt: new Date().toISOString() } });
      return id;
    },
    [nodes, persist]
  );

  const updateNode = useCallback(
    (id: string, content: string) => {
      if (!nodes[id]) return;
      persist({ ...nodes, [id]: { ...nodes[id], content } });
    },
    [nodes, persist]
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
      const updated = { ...nodes };
      toDelete.forEach((nid) => delete updated[nid]);
      persist(updated);
    },
    [nodes, persist]
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
      const rootId = insertTree(data.thought, parentId);
      persist(newNodes);
      return rootId;
    },
    [nodes, persist]
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
      const newRootId = insertTree(data.thought, null);
      persist(updated);
      return newRootId;
    },
    [nodes, persist]
  );

  return { nodes, hydrated, createNode, updateNode, deleteNode, exportThought, importThought, replaceThought };
}
