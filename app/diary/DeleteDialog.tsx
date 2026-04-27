import type { DiaryNode, NodesMap } from "./types";

interface DeleteDialogProps {
  node: DiaryNode;
  nodes: NodesMap;
  onConfirm: () => void;
  onClose: () => void;
}

function countDescendants(nodeId: string, nodes: NodesMap): number {
  let count = 0;
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const n of Object.values(nodes)) {
      if (n.parentId === current) {
        count++;
        queue.push(n.id);
      }
    }
  }
  return count;
}

export function DeleteDialog({ node, nodes, onConfirm, onClose }: DeleteDialogProps) {
  const descendants = countDescendants(node.id, nodes);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden border-t border-x sm:border border-gray-100 dark:border-gray-800">
        <div className="px-6 py-5">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>

          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete Note</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to delete{" "}
            <span className="font-medium text-gray-700 dark:text-gray-200">&quot;{node.title}&quot;</span>?
          </p>

          {descendants > 0 && (
            <div className="mt-3 px-3 py-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                This will also delete {descendants} child note{descendants !== 1 ? "s" : ""} inside it.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
