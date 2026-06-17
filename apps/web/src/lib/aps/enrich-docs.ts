import { getTwoLeggedToken, isApsConfigured } from "./auth";
import {
  fetchDocsMetricsFromApi,
  type DocsContentApiMetrics,
  type DocsPlatform,
} from "./data-management";
import {
  markDocsScanFailed,
  markDocsScanStarted,
  persistProjectDocsInventory,
  persistProjectDocsMetricsOnly,
} from "./persist-inventory";
import { scanProjectDocsInventory } from "./scan-project-inventory";

export interface ProjectDocsTarget {
  projectId: string;
  accountId: string;
  platform: DocsPlatform;
  batchId?: string;
}

export type DocsScanMode = "full" | "metrics" | "auto";

export function getDocsScanMode(): DocsScanMode {
  const raw = process.env.APS_DOCS_SCAN_MODE?.trim().toLowerCase();
  if (raw === "full" || raw === "metrics" || raw === "auto") {
    return raw;
  }
  return "auto";
}

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.toLowerCase().includes("quota");
}

export function shouldEnrichDocsFromApi(): boolean {
  return isApsConfigured() && process.env.APS_ENRICH_DOCS_METRICS === "true";
}

export function shouldScanDocsInventory(): boolean {
  return isApsConfigured() && process.env.APS_SCAN_DOCS_INVENTORY === "true";
}

export function getDocsEnrichmentProjectFilter(): Set<string> | null {
  const raw =
    process.env.APS_DOCS_SCAN_PROJECT_IDS?.trim() ??
    process.env.APS_DOCS_METRICS_PROJECT_IDS?.trim();
  if (!raw) {
    return null;
  }
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

export function getDocsScanMaxProjects(): number {
  const raw =
    process.env.APS_DOCS_SCAN_MAX_PROJECTS ??
    process.env.APS_DOCS_METRICS_MAX_PROJECTS ??
    "0";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export function getDocsScanMaxItemsPerProject(): number {
  const parsed = Number(process.env.APS_DOCS_SCAN_MAX_ITEMS_PER_PROJECT ?? "10000");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10_000;
  }
  return Math.min(parsed, 50_000);
}

function hasCsvDocsEvidence(metrics: {
  folders: number;
  files: number;
  versions: number;
}): boolean {
  return metrics.folders > 0 || metrics.files > 0 || metrics.versions > 0;
}

function shouldSkipProject(
  target: ProjectDocsTarget,
  filter: Set<string> | null,
  csvMetricsByProject: Map<
    string,
    { folders: number; files: number; versions: number }
  >,
): boolean {
  if (filter && !filter.has(target.projectId)) {
    return true;
  }
  const csvMetrics = csvMetricsByProject.get(target.projectId);
  return Boolean(csvMetrics && hasCsvDocsEvidence(csvMetrics));
}

export async function executeProjectDocsMetricsScan(
  target: ProjectDocsTarget & { batchId: string },
  onProgress?: (message: string) => void,
): Promise<DocsContentApiMetrics> {
  const token = await getTwoLeggedToken();
  await markDocsScanStarted(target.batchId, target.projectId);

  try {
    onProgress?.("Running metrics-only docs scan (counts + file types)…");
    const metrics = await fetchDocsMetricsFromApi(token, {
      accountId: target.accountId,
      projectId: target.projectId,
      platform: target.platform,
      includeAllVersions: false,
    });
    await persistProjectDocsMetricsOnly(target.batchId, target.projectId, metrics);
    return metrics;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDocsScanFailed(target.batchId, target.projectId, message);
    throw error;
  }
}

export async function executeProjectDocsScan(
  target: ProjectDocsTarget & { batchId: string },
  onProgress?: (message: string) => void,
  mode: DocsScanMode = getDocsScanMode(),
): Promise<DocsContentApiMetrics> {
  if (mode === "metrics") {
    return executeProjectDocsMetricsScan(target, onProgress);
  }

  const token = await getTwoLeggedToken();
  const maxItems = getDocsScanMaxItemsPerProject();

  await markDocsScanStarted(target.batchId, target.projectId);

  try {
    const inventory = await scanProjectDocsInventory(token, {
      accountId: target.accountId,
      projectId: target.projectId,
      platform: target.platform,
      includeAllVersions: process.env.APS_INCLUDE_ALL_VERSIONS === "true",
      maxItems,
      onProgress,
    });

    await persistProjectDocsInventory(target.batchId, target.projectId, inventory);

    return {
      folders: inventory.folderCount,
      files: inventory.fileCount,
      versions: inventory.versionCount,
      tipVersions: inventory.fileCount,
      scannedFolders: inventory.folderCount,
      source: "data_management_api",
      formatSummary: inventory.formatSummary,
      scanMode: "full",
    };
  } catch (error) {
    if (mode === "auto" && isQuotaError(error)) {
      onProgress?.("APS quota hit — retrying with metrics-only scan…");
      try {
        return await executeProjectDocsMetricsScan(target, onProgress);
      } catch (metricsError) {
        const message =
          metricsError instanceof Error ? metricsError.message : String(metricsError);
        await markDocsScanFailed(target.batchId, target.projectId, message);
        throw metricsError;
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    await markDocsScanFailed(target.batchId, target.projectId, message);
    throw error;
  }
}

export async function scanDocsInventoryForProjects(
  targets: ProjectDocsTarget[],
  csvMetricsByProject: Map<
    string,
    { folders: number; files: number; versions: number }
  >,
  onProgress?: (message: string) => void,
): Promise<Map<string, DocsContentApiMetrics>> {
  const results = new Map<string, DocsContentApiMetrics>();
  if (!shouldScanDocsInventory() || targets.length === 0) {
    return results;
  }

  const filter = getDocsEnrichmentProjectFilter();
  const maxProjects = getDocsScanMaxProjects();
  let scanned = 0;

  for (const target of targets) {
    if (filter && !filter.has(target.projectId)) {
      continue;
    }
    if (maxProjects > 0 && scanned >= maxProjects) {
      break;
    }
    if (!target.batchId) {
      continue;
    }

    try {
      onProgress?.(`Scanning docs inventory: ${target.projectId}`);
      const metrics = await executeProjectDocsScan(
        { ...target, batchId: target.batchId },
        onProgress,
      );
      results.set(target.projectId, metrics);
      scanned += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Docs inventory scan failed for ${target.projectId}: ${message}`);
      await markDocsScanFailed(target.batchId, target.projectId, message);
    }
  }

  return results;
}

/**
 * Fast metrics-only enrichment when full inventory scan is disabled.
 */
export async function enrichDocsMetricsForProjects(
  targets: ProjectDocsTarget[],
  csvMetricsByProject: Map<
    string,
    { folders: number; files: number; versions: number }
  >,
): Promise<Map<string, DocsContentApiMetrics>> {
  if (shouldScanDocsInventory()) {
    return scanDocsInventoryForProjects(targets, csvMetricsByProject);
  }

  const results = new Map<string, DocsContentApiMetrics>();
  if (!shouldEnrichDocsFromApi() || targets.length === 0) {
    return results;
  }

  const token = await getTwoLeggedToken();
  const filter = getDocsEnrichmentProjectFilter();
  const maxProjects = getDocsScanMaxProjects() || 5;
  let enriched = 0;

  for (const target of targets) {
    if (shouldSkipProject(target, filter, csvMetricsByProject)) {
      continue;
    }
    if (enriched >= maxProjects) {
      break;
    }

    try {
      const metrics = await fetchDocsMetricsFromApi(token, {
        accountId: target.accountId,
        projectId: target.projectId,
        platform: target.platform,
        includeAllVersions: process.env.APS_INCLUDE_ALL_VERSIONS === "true",
      });

      if (metrics.folders > 0 || metrics.files > 0 || metrics.versions > 0) {
        results.set(target.projectId, metrics);
      }
      enriched += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Docs API enrichment skipped for ${target.projectId}: ${message}`);
    }
  }

  return results;
}
