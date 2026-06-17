"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatNumber } from "@/lib/utils";

export interface DocsInventorySummary {
  status: string;
  folderCount: number;
  fileCount: number;
  versionCount: number;
  formatSummary: Record<string, number>;
  scannedAt: string | null;
  errorMessage: string | null;
}

export interface DocsFolderRow {
  id: string;
  name: string;
  isTopFolder: boolean;
  objectCount: number | null;
  hidden: boolean;
  childFolderCount: number;
  fileCount: number;
}

export interface DocsFileVersionRow {
  id: string;
  versionNumber: number | null;
  displayName: string | null;
  extension: string | null;
  fileType: string | null;
  mimeType: string | null;
  storageSize: string | null;
  isTip: boolean;
  createdAt: string | null;
  lastModifiedAt: string | null;
}

export interface DocsFileRow {
  id: string;
  displayName: string;
  extension: string | null;
  fileType: string | null;
  mimeType: string | null;
  versionCount: number;
  tipVersionNumber: number | null;
  storageSize: string | null;
  folderName: string | null;
  lastModifiedAt: string | null;
  versions: DocsFileVersionRow[];
}

interface ProjectDocsInventoryProps {
  summary: DocsInventorySummary | null;
  folders: DocsFolderRow[];
  files: DocsFileRow[];
}

function formatBytes(value: string | null): string {
  if (!value) return "—";
  try {
    const bytes = BigInt(value);
    const kbBase = BigInt(1024);
    if (bytes < kbBase) return `${bytes} B`;
    const kb = Number(bytes) / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  } catch {
    return "—";
  }
}

export function ProjectDocsInventory({
  summary,
  folders,
  files,
}: ProjectDocsInventoryProps) {
  const [query, setQuery] = useState("");
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return files;
    return files.filter((file) => {
      return (
        file.displayName.toLowerCase().includes(needle) ||
        (file.extension?.toLowerCase().includes(needle) ?? false) ||
        (file.fileType?.toLowerCase().includes(needle) ?? false) ||
        (file.folderName?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [files, query]);

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Docs inventory</CardTitle>
          <CardDescription>
            No live Docs scan yet. Enable APS_SCAN_DOCS_INVENTORY and re-import, or run the scan script.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatEntries = Object.entries(summary.formatSummary ?? {}).slice(0, 12);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Docs inventory</CardTitle>
          <CardDescription>
            Folders, files, and versions from APS Data Management
            {summary.scannedAt ? ` · scanned ${formatDate(summary.scannedAt)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={summary.status === "completed" ? "success" : "muted"}>
              {summary.status}
            </Badge>
            {summary.errorMessage ? (
              <span className="text-sm text-destructive">{summary.errorMessage}</span>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Folders</p>
              <p className="text-2xl font-semibold">{formatNumber(summary.folderCount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Files</p>
              <p className="text-2xl font-semibold">{formatNumber(summary.fileCount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Versions</p>
              <p className="text-2xl font-semibold">{formatNumber(summary.versionCount)}</p>
            </div>
          </div>

          {formatEntries.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium">File formats (by extension)</p>
              <div className="flex flex-wrap gap-2">
                {formatEntries.map(([extension, count]) => (
                  <Badge key={extension} variant="muted">
                    {extension}: {formatNumber(count)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Folders</CardTitle>
          <CardDescription>Top-level and nested folder structure.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Subfolders</th>
                <th className="py-2 pr-4">Files</th>
                <th className="py-2">Objects</th>
              </tr>
            </thead>
            <tbody>
              {folders.slice(0, 100).map((folder) => (
                <tr key={folder.id} className="border-t border-border">
                  <td className="py-2 pr-4">{folder.name}</td>
                  <td className="py-2 pr-4">{folder.isTopFolder ? "Top" : "Subfolder"}</td>
                  <td className="py-2 pr-4">{formatNumber(folder.childFolderCount)}</td>
                  <td className="py-2 pr-4">{formatNumber(folder.fileCount)}</td>
                  <td className="py-2">{folder.objectCount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {folders.length > 100 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Showing first 100 of {formatNumber(folders.length)} folders.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Files & versions</CardTitle>
          <CardDescription>
            Search by name, extension, type, or folder. Click a row to expand version history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files…"
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Ext</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Versions</th>
                  <th className="py-2 pr-4">Size</th>
                  <th className="py-2 pr-4">Folder</th>
                  <th className="py-2">Modified</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.slice(0, 100).map((file) => (
                  <Fragment key={file.id}>
                    <tr
                      key={file.id}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() =>
                        setExpandedFileId(expandedFileId === file.id ? null : file.id)
                      }
                    >
                      <td className="py-2 pr-4 font-medium">{file.displayName}</td>
                      <td className="py-2 pr-4">{file.extension ?? "—"}</td>
                      <td className="py-2 pr-4">{file.fileType ?? "—"}</td>
                      <td className="py-2 pr-4">{formatNumber(file.versionCount)}</td>
                      <td className="py-2 pr-4">{formatBytes(file.storageSize)}</td>
                      <td className="py-2 pr-4">{file.folderName ?? "—"}</td>
                      <td className="py-2">{formatDate(file.lastModifiedAt)}</td>
                    </tr>
                    {expandedFileId === file.id ? (
                      <tr key={`${file.id}-versions`} className="border-t border-border bg-muted/20">
                        <td colSpan={7} className="p-4">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground">
                                <th className="py-1 pr-3">Ver</th>
                                <th className="py-1 pr-3">Name</th>
                                <th className="py-1 pr-3">Ext</th>
                                <th className="py-1 pr-3">MIME</th>
                                <th className="py-1 pr-3">Size</th>
                                <th className="py-1">Modified</th>
                              </tr>
                            </thead>
                            <tbody>
                              {file.versions.map((version) => (
                                <tr key={version.id}>
                                  <td className="py-1 pr-3">
                                    {version.versionNumber ?? "—"}
                                    {version.isTip ? " (tip)" : ""}
                                  </td>
                                  <td className="py-1 pr-3">{version.displayName ?? "—"}</td>
                                  <td className="py-1 pr-3">{version.extension ?? "—"}</td>
                                  <td className="py-1 pr-3">{version.mimeType ?? "—"}</td>
                                  <td className="py-1 pr-3">{formatBytes(version.storageSize)}</td>
                                  <td className="py-1">{formatDate(version.lastModifiedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {filteredFiles.length > 100 ? (
            <p className="text-sm text-muted-foreground">
              Showing first 100 of {formatNumber(filteredFiles.length)} matching files.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
