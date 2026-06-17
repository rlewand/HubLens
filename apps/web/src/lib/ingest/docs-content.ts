import path from "node:path";
import { access } from "node:fs/promises";
import Papa from "papaparse";
import { createReadStream } from "node:fs";
import { parseTimestamp } from "./parser";
import type { DocsContentApiMetrics } from "@/lib/aps/data-management";

/** Synthetic evidence keys written to module_evidence for Docs content metrics. */
export const DOCS_CONTENT_TABLE_KEYS = {
  folders: "docs_content_folders",
  files: "docs_content_files",
  versions: "docs_content_versions",
} as const;

export type DocsContentTableKey =
  (typeof DOCS_CONTENT_TABLE_KEYS)[keyof typeof DOCS_CONTENT_TABLE_KEYS];

export interface DocsContentMetrics {
  folders: number;
  files: number;
  versions: number;
  trashedVersions: number;
  distinctUsers: number;
  lastActivityAt: Date | null;
}

interface ProjectDocsAccumulator {
  folders: Set<string>;
  files: Set<string>;
  versions: number;
  trashedVersions: number;
  users: Set<string>;
  lastActivityAt: Date | null;
}

function getOrCreate(
  map: Map<string, ProjectDocsAccumulator>,
  projectId: string,
): ProjectDocsAccumulator {
  const existing = map.get(projectId);
  if (existing) {
    return existing;
  }
  const created: ProjectDocsAccumulator = {
    folders: new Set<string>(),
    files: new Set<string>(),
    versions: 0,
    trashedVersions: 0,
    users: new Set<string>(),
    lastActivityAt: null,
  };
  map.set(projectId, created);
  return created;
}

function isTrashed(value: string | undefined): boolean {
  return value?.toLowerCase() === "t" || value?.toLowerCase() === "true";
}

/**
 * Derives folder, file, and version counts from packages_version_resources.csv.
 * Schema: packages.json → version_resources (path = folder URN, urn = file lineage).
 */
export async function aggregateDocsContentFromPackages(
  inputDir: string,
  projectIds: Set<string>,
): Promise<Map<string, DocsContentMetrics>> {
  const filePath = path.join(inputDir, "packages_version_resources.csv");
  try {
    await access(filePath);
  } catch {
    return new Map();
  }

  const accumulators = new Map<string, ProjectDocsAccumulator>();

  await new Promise<void>((resolve, reject) => {
    Papa.parse<Record<string, string>>(createReadStream(filePath), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      step: (result) => {
        const row = result.data;
        const projectId = row.bim360_project_id;
        if (!projectId || !projectIds.has(projectId)) {
          return;
        }

        if (isTrashed(row.trashed)) {
          const acc = getOrCreate(accumulators, projectId);
          acc.trashedVersions += 1;
          return;
        }

        const acc = getOrCreate(accumulators, projectId);
        acc.versions += 1;

        if (row.urn) {
          acc.files.add(row.urn);
        }
        if (row.path) {
          acc.folders.add(row.path);
        }

        const user = row.updated_by || row.created_by;
        if (user) {
          acc.users.add(user);
        }

        const activity = parseTimestamp(row.updated_at) ?? parseTimestamp(row.created_at);
        if (activity && (!acc.lastActivityAt || activity > acc.lastActivityAt)) {
          acc.lastActivityAt = activity;
        }
      },
      complete: () => resolve(),
      error: (error) => reject(error),
    });
  });

  const metrics = new Map<string, DocsContentMetrics>();
  for (const [projectId, acc] of accumulators.entries()) {
    metrics.set(projectId, {
      folders: acc.folders.size,
      files: acc.files.size,
      versions: acc.versions,
      trashedVersions: acc.trashedVersions,
      distinctUsers: acc.users.size,
      lastActivityAt: acc.lastActivityAt,
    });
  }

  return metrics;
}

export interface DocsContentEvidenceRow {
  projectId: string;
  tableKey: DocsContentTableKey;
  recordCount: number;
  distinctUsers: number;
  lastActivityAt: Date | null;
}

export function docsContentMetricsToEvidenceRows(
  metricsByProject: Map<string, DocsContentMetrics>,
): DocsContentEvidenceRow[] {
  const rows: DocsContentEvidenceRow[] = [];

  for (const [projectId, metrics] of metricsByProject.entries()) {
    const shared = {
      distinctUsers: metrics.distinctUsers,
      lastActivityAt: metrics.lastActivityAt,
    };

    if (metrics.folders > 0) {
      rows.push({
        projectId,
        tableKey: DOCS_CONTENT_TABLE_KEYS.folders,
        recordCount: metrics.folders,
        ...shared,
      });
    }
    if (metrics.files > 0) {
      rows.push({
        projectId,
        tableKey: DOCS_CONTENT_TABLE_KEYS.files,
        recordCount: metrics.files,
        ...shared,
      });
    }
    if (metrics.versions > 0) {
      rows.push({
        projectId,
        tableKey: DOCS_CONTENT_TABLE_KEYS.versions,
        recordCount: metrics.versions,
        ...shared,
      });
    }
  }

  return rows;
}

/** Maps APS Data Management metrics into module_evidence rows for one project. */
export function apiDocsMetricsToEvidenceRows(
  projectId: string,
  metrics: Pick<DocsContentApiMetrics, "folders" | "files" | "versions">,
  lastActivityAt: Date | null = null,
): DocsContentEvidenceRow[] {
  const rows: DocsContentEvidenceRow[] = [];
  const shared = { distinctUsers: 0, lastActivityAt };

  if (metrics.folders > 0) {
    rows.push({
      projectId,
      tableKey: DOCS_CONTENT_TABLE_KEYS.folders,
      recordCount: metrics.folders,
      ...shared,
    });
  }
  if (metrics.files > 0) {
    rows.push({
      projectId,
      tableKey: DOCS_CONTENT_TABLE_KEYS.files,
      recordCount: metrics.files,
      ...shared,
    });
  }
  if (metrics.versions > 0) {
    rows.push({
      projectId,
      tableKey: DOCS_CONTENT_TABLE_KEYS.versions,
      recordCount: metrics.versions,
      ...shared,
    });
  }

  return rows;
}
