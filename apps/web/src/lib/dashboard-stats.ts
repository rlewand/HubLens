import type { FeatureColumnDef } from "@hublens/maturity-engine";
import type { MaturityLevel } from "@hublens/maturity-engine";
import { MODULE_KEYS, type ModuleKey } from "@/lib/constants";
import type { ProjectRow } from "@/components/dashboard/project-table";
import { formatServiceLabel } from "@/lib/constants";
import type { MigrationEstimate } from "@/lib/migration-estimate";

export type PlatformFilter = "all" | "acc" | "bim360";

export interface ProjectDocsSummary {
  folders: number;
  files: number;
  versions: number;
  scanned: boolean;
  scanStatus: "completed" | "failed" | "scanning" | null;
  scanError: string | null;
}

export interface DashboardProjectRow extends ProjectRow {
  services: string[];
  products: string[];
  features: Record<string, number>;
  docs: ProjectDocsSummary;
  adminCount: number;
  migration: MigrationEstimate;
  syncDocs: boolean;
}

export interface DashboardKpis {
  totalProjects: number;
  activeProjects: number;
  adoptedRate: number;
  lastRefresh: string;
  docsScannedProjects: number;
  docsTotals: {
    folders: number;
    files: number;
    versions: number;
  };
}

export interface ModuleDistribution {
  moduleKey: ModuleKey;
  notEnabled: number;
  provisioned: number;
  adopted: number;
  active: number;
  optimized: number;
}

export interface AdoptionItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface DashboardStats {
  kpis: DashboardKpis;
  distribution: ModuleDistribution[];
  services: AdoptionItem[];
  products: AdoptionItem[];
}

export function filterProjects(
  projects: DashboardProjectRow[],
  platform: PlatformFilter,
  status: string,
  search: string,
): DashboardProjectRow[] {
  const query = search.trim().toLowerCase();

  return projects.filter((project) => {
    const matchesPlatform =
      platform === "all" ||
      (platform === "acc" && project.accProject) ||
      (platform === "bim360" && !project.accProject);

    const normalizedStatus = (project.status ?? "").toLowerCase();
    const matchesStatus =
      status === "all" ||
      normalizedStatus === status.toLowerCase() ||
      (status === "archived" &&
        (normalizedStatus === "archived" || normalizedStatus === "inactive"));

    const matchesSearch =
      query === "" ||
      project.name.toLowerCase().includes(query) ||
      (project.jobNumber?.toLowerCase().includes(query) ?? false);

    return matchesPlatform && matchesStatus && matchesSearch;
  });
}

function tallyKeys(
  projects: DashboardProjectRow[],
  accessor: (project: DashboardProjectRow) => string[],
): AdoptionItem[] {
  const counts = new Map<string, number>();
  for (const project of projects) {
    for (const key of accessor(project)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const total = projects.length || 1;
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      label: formatServiceLabel(key),
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeDashboardStats(
  projects: DashboardProjectRow[],
  lastRefresh: string,
): DashboardStats {
  const adoptedProjects = projects.filter((project) =>
    MODULE_KEYS.some((moduleKey) => (project.maturity[moduleKey] ?? 0) >= 2),
  ).length;

  const scannedProjects = projects.filter((project) => project.docs.scanned);
  const docsTotals = scannedProjects.reduce(
    (totals, project) => ({
      folders: totals.folders + project.docs.folders,
      files: totals.files + project.docs.files,
      versions: totals.versions + project.docs.versions,
    }),
    { folders: 0, files: 0, versions: 0 },
  );

  const distribution: ModuleDistribution[] = MODULE_KEYS.map((moduleKey) => {
    const levels = projects.map((project) => project.maturity[moduleKey] ?? 0);
    return {
      moduleKey,
      notEnabled: levels.filter((level) => level === 0).length,
      provisioned: levels.filter((level) => level === 1).length,
      adopted: levels.filter((level) => level === 2).length,
      active: levels.filter((level) => level === 3).length,
      optimized: levels.filter((level) => level === 4).length,
    };
  });

  return {
    kpis: {
      totalProjects: projects.length,
      activeProjects: projects.filter((project) => project.status === "active").length,
      adoptedRate:
        projects.length === 0 ? 0 : Math.round((adoptedProjects / projects.length) * 100),
      lastRefresh,
      docsScannedProjects: scannedProjects.length,
      docsTotals,
    },
    distribution,
    services: tallyKeys(projects, (project) => project.services),
    products: tallyKeys(projects, (project) => project.products),
  };
}

export const MATURITY_LEVEL_LABELS: Record<MaturityLevel, string> = {
  0: "Not enabled",
  1: "Provisioned",
  2: "Adopted",
  3: "Active",
  4: "Optimized",
};

export interface FeatureColumnWithTotals extends FeatureColumnDef {
  totalRecords: number;
  projectsWithData: number;
}

export function buildActiveFeatureColumns(
  projects: DashboardProjectRow[],
  columns: FeatureColumnDef[],
): { active: FeatureColumnWithTotals[]; hidden: FeatureColumnDef[] } {
  const active: FeatureColumnWithTotals[] = [];
  const hidden: FeatureColumnDef[] = [];

  for (const column of columns) {
    let totalRecords = 0;
    let projectsWithData = 0;
    for (const project of projects) {
      const count = project.features[column.key] ?? 0;
      totalRecords += count;
      if (count > 0) {
        projectsWithData += 1;
      }
    }
    if (totalRecords > 0) {
      active.push({ ...column, totalRecords, projectsWithData });
    } else {
      hidden.push(column);
    }
  }

  return { active, hidden };
}
