export interface DiaryNode {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  isRead: boolean;
}

export interface NodesMap {
  [id: string]: DiaryNode;
}

export type DialogMode = "create" | "edit" | null;

export interface ExportedNode {
  title: string;
  content: string;
  createdAt: string;
  children: ExportedNode[];
}

export interface ExportData {
  version: 1;
  exportedAt: string;
  thought: ExportedNode;
}
