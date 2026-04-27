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
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(nodes: NodesMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
}

export function useNodes() {
  // Start empty to match SSR; hydrate from localStorage after mount
  const [nodes, setNodes] = useState<NodesMap>({});

  useEffect(() => {
    const stored = loadFromStorage();
    if (Object.keys(stored).length > 0) setNodes(stored);
  }, []);

  const persist = useCallback((updated: NodesMap) => {
    setNodes(updated);
    saveToStorage(updated);
  }, []);

  const createNode = useCallback(
    (title: string, content: string, parentId: string | null) => {
      const id = generateId();
      const node: DiaryNode = {
        id,
        title,
        content,
        parentId,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      persist({ ...nodes, [id]: node });
      return id;
    },
    [nodes, persist]
  );

  const updateNode = useCallback(
    (id: string, title: string, content: string) => {
      if (!nodes[id]) return;
      persist({ ...nodes, [id]: { ...nodes[id], title, content } });
    },
    [nodes, persist]
  );

  const deleteNode = useCallback(
    (id: string) => {
      // Collect all descendant IDs to delete them too
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

  const markRead = useCallback(
    (id: string, isRead: boolean) => {
      if (!nodes[id]) return;
      persist({ ...nodes, [id]: { ...nodes[id], isRead } });
    },
    [nodes, persist]
  );

  const getRoots = useCallback((): DiaryNode[] => {
    return Object.values(nodes)
      .filter((n) => n.parentId === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [nodes]);

  const getChildren = useCallback(
    (parentId: string): DiaryNode[] => {
      return Object.values(nodes)
        .filter((n) => n.parentId === parentId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    [nodes]
  );

  // Depth-first pre-order traversal for read mode.
  // If rootId is provided, traverses only that subtree (inclusive).
  const getReadOrder = useCallback((rootId?: string): DiaryNode[] => {
    const result: DiaryNode[] = [];
    function dfs(id: string) {
      const node = nodes[id];
      if (!node) return;
      result.push(node);
      Object.values(nodes)
        .filter((n) => n.parentId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .forEach((child) => dfs(child.id));
    }
    if (rootId) {
      dfs(rootId);
    } else {
      Object.values(nodes)
        .filter((n) => n.parentId === null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .forEach((root) => dfs(root.id));
    }
    return result;
  }, [nodes]);

  const getAncestors = useCallback(
    (id: string): DiaryNode[] => {
      const ancestors: DiaryNode[] = [];
      let current = nodes[id];
      while (current?.parentId) {
        const parent = nodes[current.parentId];
        if (!parent) break;
        ancestors.unshift(parent);
        current = parent;
      }
      return ancestors;
    },
    [nodes]
  );

  const exportThought = useCallback(
    (id: string): ExportData => {
      function buildTree(nodeId: string): ExportedNode {
        const node = nodes[nodeId];
        const children = Object.values(nodes)
          .filter((n) => n.parentId === nodeId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((c) => buildTree(c.id));
        return { title: node.title, content: node.content, createdAt: node.createdAt, children };
      }
      return { version: 1, exportedAt: new Date().toISOString(), thought: buildTree(id) };
    },
    [nodes]
  );

  const importThought = useCallback(
    (data: ExportData, parentId: string | null): string => {
      const newNodes = { ...nodes };
      function insertTree(exported: ExportedNode, parent: string | null): string {
        const id = generateId();
        newNodes[id] = {
          id,
          title: exported.title,
          content: exported.content,
          parentId: parent,
          createdAt: exported.createdAt,
          isRead: false,
        };
        for (const child of exported.children) insertTree(child, id);
        return id;
      }
      const rootId = insertTree(data.thought, parentId);
      persist(newNodes);
      return rootId;
    },
    [nodes, persist]
  );

  return {
    nodes,
    createNode,
    updateNode,
    deleteNode,
    markRead,
    getRoots,
    getChildren,
    getReadOrder,
    getAncestors,
    exportThought,
    importThought,
  };
}
