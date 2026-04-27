export interface DiaryNode {
  id: string;
  content: string;
  parentId: string | null;
  createdAt: string;
}

export type NodesMap = Record<string, DiaryNode>;

export interface ExportedNode {
  content: string;
  createdAt: string;
  children: ExportedNode[];
}

export interface ExportData {
  version: 2;
  exportedAt: string;
  thought: ExportedNode;
}
