import { readFileSync } from "node:fs";
import { parse } from "yaml";

export interface FeatureDefinition {
  display_name: string;
  description?: string;
  module: string;
  enabled_from: string[];
  /** @deprecated Use evidence_tables */
  evidence_table?: string;
  /** Primary evidence CSV table keys (e.g. ACC + BIM 360 variants). */
  evidence_tables?: string[];
  related_tables?: string[];
}

export interface FeatureCatalogConfig {
  features: Record<string, FeatureDefinition>;
}

export function resolveFeatureEvidenceTables(feature: FeatureDefinition): string[] {
  if (feature.evidence_tables && feature.evidence_tables.length > 0) {
    return feature.evidence_tables;
  }
  if (feature.evidence_table) {
    return [feature.evidence_table];
  }
  return [];
}

export function loadFeatureCatalogFromFile(filePath: string): FeatureCatalogConfig {
  const raw = readFileSync(filePath, "utf8");
  return parse(raw) as FeatureCatalogConfig;
}

export function getAllFeatureEvidenceTables(catalog: FeatureCatalogConfig): Set<string> {
  const tables = new Set<string>();
  for (const feature of Object.values(catalog.features)) {
    for (const tableKey of resolveFeatureEvidenceTables(feature)) {
      tables.add(tableKey);
    }
    for (const related of feature.related_tables ?? []) {
      tables.add(related);
    }
  }
  return tables;
}

export interface FeatureColumnDef {
  key: string;
  label: string;
}

export function getFeatureColumnDefinitions(catalog: FeatureCatalogConfig): FeatureColumnDef[] {
  return Object.entries(catalog.features).map(([key, feature]) => ({
    key,
    label: feature.display_name,
  }));
}

function mergeEvidenceSnapshots(
  snapshots: FeatureEvidenceSnapshot[],
): Pick<FeatureEvidenceSnapshot, "recordCount" | "distinctUsers" | "lastActivityAt"> {
  return {
    recordCount: snapshots.reduce((sum, row) => sum + row.recordCount, 0),
    distinctUsers: snapshots.reduce((max, row) => Math.max(max, row.distinctUsers), 0),
    lastActivityAt: snapshots.reduce<Date | null>((latest, row) => {
      if (!row.lastActivityAt) {
        return latest;
      }
      if (!latest || row.lastActivityAt > latest) {
        return row.lastActivityAt;
      }
      return latest;
    }, null),
  };
}

export function buildProjectFeatureCounts(
  catalog: FeatureCatalogConfig,
  evidenceByTable: Map<string, number>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, feature] of Object.entries(catalog.features)) {
    counts[key] = resolveFeatureEvidenceTables(feature).reduce(
      (sum, tableKey) => sum + (evidenceByTable.get(tableKey) ?? 0),
      0,
    );
  }
  return counts;
}

export function isFeatureEnabled(
  enabledFrom: string[],
  services: string[],
  products: string[],
): boolean {
  const keys = [...services, ...products].map((key) => key.toLowerCase());
  return enabledFrom.some((key) => keys.includes(key.toLowerCase()));
}

export type FeatureUsageStatus = "not_enabled" | "unused" | "adopted" | "active";

export interface FeatureEvidenceSnapshot {
  tableKey: string;
  recordCount: number;
  distinctUsers: number;
  lastActivityAt: Date | null;
}

export interface ProjectFeatureUsage {
  key: string;
  displayName: string;
  description?: string;
  moduleKey: string;
  enabled: boolean;
  recordCount: number;
  distinctUsers: number;
  lastActivityAt: Date | null;
  status: FeatureUsageStatus;
  statusLabel: string;
  primaryTable: string;
  evidenceSources: string[];
  relatedUsage: FeatureEvidenceSnapshot[];
}

const FEATURE_STATUS_LABELS: Record<FeatureUsageStatus, string> = {
  not_enabled: "Not enabled",
  unused: "Enabled, unused",
  adopted: "Adopted",
  active: "Active",
};

function resolveFeatureStatus(
  enabled: boolean,
  recordCount: number,
  distinctUsers: number,
  lastActivityAt: Date | null,
  reference: Date,
): FeatureUsageStatus {
  if (!enabled) {
    return "not_enabled";
  }
  if (recordCount === 0) {
    return "unused";
  }
  const daysSinceActivity =
    lastActivityAt === null
      ? Number.POSITIVE_INFINITY
      : (reference.getTime() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
  if (recordCount >= 10 && distinctUsers >= 2 && daysSinceActivity <= 90) {
    return "active";
  }
  return "adopted";
}

export function buildProjectFeatureUsage(
  catalog: FeatureCatalogConfig,
  services: string[],
  products: string[],
  evidenceByTable: Map<string, FeatureEvidenceSnapshot>,
  reference: Date = new Date(),
): ProjectFeatureUsage[] {
  return Object.entries(catalog.features).map(([key, feature]) => {
    const enabled = isFeatureEnabled(feature.enabled_from, services, products);
    const evidenceTables = resolveFeatureEvidenceTables(feature);
    const primarySnapshots = evidenceTables
      .map((tableKey) => evidenceByTable.get(tableKey))
      .filter((row): row is FeatureEvidenceSnapshot => row !== undefined);
    const merged = mergeEvidenceSnapshots(primarySnapshots);
    const status = resolveFeatureStatus(
      enabled,
      merged.recordCount,
      merged.distinctUsers,
      merged.lastActivityAt,
      reference,
    );

    const relatedUsage = (feature.related_tables ?? [])
      .map((tableKey) => evidenceByTable.get(tableKey))
      .filter((row): row is FeatureEvidenceSnapshot => row !== undefined && row.recordCount > 0);

    return {
      key,
      displayName: feature.display_name,
      description: feature.description,
      moduleKey: feature.module,
      enabled,
      recordCount: merged.recordCount,
      distinctUsers: merged.distinctUsers,
      lastActivityAt: merged.lastActivityAt,
      status,
      statusLabel: FEATURE_STATUS_LABELS[status],
      primaryTable: evidenceTables[0] ?? "",
      evidenceSources: evidenceTables,
      relatedUsage,
    };
  });
}
