"use client";

import { useState, useEffect, useCallback } from "react";
import type { FolderNode, ExplorerFile, FolderPath } from "@/types/document-explorer";

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function useDocumentExplorer() {
  // Tree state
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [unassigned, setUnassigned] = useState<FolderNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);

  // Active folder
  const [activePath, setActivePath] = useState<FolderPath | null>(null);

  // Files state
  const [files, setFiles] = useState<ExplorerFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch tree
  const fetchTree = useCallback(() => {
    setTreeLoading(true);
    fetch("/api/documents/explorer/tree")
      .then((r) => r.json())
      .then((d) => {
        if (d.tree) {
          setTree(d.tree);
          setUnassigned(d.unassigned ?? null);
        }
      })
      .catch(console.error)
      .finally(() => setTreeLoading(false));
  }, []);

  // Fetch files for active folder
  const fetchFiles = useCallback((path: FolderPath, page = 1) => {
    setFilesLoading(true);
    setSelectedIds(new Set());
    const params = new URLSearchParams({
      year: String(path.year),
      category: path.category,
      page: String(page),
      limit: "20",
    });
    if (path.parkId) params.set("parkId", path.parkId);

    fetch(`/api/documents/explorer/folder?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setFiles(d.data);
          setPagination(d.pagination);
        }
      })
      .catch(console.error)
      .finally(() => setFilesLoading(false));
  }, []);

  // Load tree on mount
  useEffect(() => {
    fetchTree(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchTree]);

  // Load files when active path changes
  useEffect(() => {
    if (activePath) {
      fetchFiles(activePath, 1); // eslint-disable-line react-hooks/set-state-in-effect
    } else {
      setFiles([]); // eslint-disable-line react-hooks/set-state-in-effect
      setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 }); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [activePath, fetchFiles]);

  const setPage = useCallback((page: number) => {
    if (activePath) fetchFiles(activePath, page);
  }, [activePath, fetchFiles]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(files.map((f) => f.id)));
  }, [files]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const refreshTree = useCallback(() => {
    fetchTree();
  }, [fetchTree]);

  const refreshFiles = useCallback(() => {
    if (activePath) fetchFiles(activePath, pagination.page);
  }, [activePath, pagination.page, fetchFiles]);

  return {
    tree,
    unassigned,
    treeLoading,
    activePath,
    setActivePath,
    files,
    filesLoading,
    pagination,
    setPage,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    refreshTree,
    refreshFiles,
  };
}
