import type { DashboardProjectRow } from "@/lib/dashboard-stats";
import type { MigrationProfile } from "@/lib/migration-estimate";

export type MigrationScanFilter = "all" | "scanned" | "not-scanned" | "failed";

export interface MigrationPortfolioFilters {
  startDateFrom: string;
  startDateTo: string;
  endDateFrom: string;
  endDateTo: string;
  membersMin: string;
  membersMax: string;
  consultantHoursMax: string;
  clientHoursMax: string;
  foldersMax: string;
  filesMax: string;
  profile: MigrationProfile | "all";
  scanStatus: MigrationScanFilter;
  candidatesOnly: boolean;
}

export const DEFAULT_MIGRATION_FILTERS: MigrationPortfolioFilters = {
  startDateFrom: "",
  startDateTo: "",
  endDateFrom: "",
  endDateTo: "",
  membersMin: "",
  membersMax: "",
  consultantHoursMax: "",
  clientHoursMax: "",
  foldersMax: "",
  filesMax: "",
  profile: "all",
  scanStatus: "all",
  candidatesOnly: false,
};

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(value: string): Date | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function matchesDateRange(
  value: string | null,
  from: Date | null,
  to: Date | null,
): boolean {
  if (!from && !to) {
    return true;
  }
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  if (from && date < from) {
    return false;
  }
  if (to && date > to) {
    return false;
  }
  return true;
}

function matchesMax(value: number, max: number | null): boolean {
  return max === null || value <= max;
}

function matchesMin(value: number | null, min: number | null): boolean {
  if (min === null) {
    return true;
  }
  return value !== null && value >= min;
}

export function countActiveMigrationFilters(filters: MigrationPortfolioFilters): number {
  let count = 0;
  if (filters.startDateFrom || filters.startDateTo) count += 1;
  if (filters.endDateFrom || filters.endDateTo) count += 1;
  if (filters.membersMin || filters.membersMax) count += 1;
  if (filters.consultantHoursMax) count += 1;
  if (filters.clientHoursMax) count += 1;
  if (filters.foldersMax) count += 1;
  if (filters.filesMax) count += 1;
  if (filters.profile !== "all") count += 1;
  if (filters.scanStatus !== "all") count += 1;
  if (filters.candidatesOnly) count += 1;
  return count;
}

export function applyMigrationPortfolioFilters(
  projects: DashboardProjectRow[],
  filters: MigrationPortfolioFilters,
): DashboardProjectRow[] {
  const startFrom = parseOptionalDate(filters.startDateFrom);
  const startToRaw = parseOptionalDate(filters.startDateTo);
  const startTo = startToRaw ? endOfDay(startToRaw) : null;
  const endFrom = parseOptionalDate(filters.endDateFrom);
  const endToRaw = parseOptionalDate(filters.endDateTo);
  const endTo = endToRaw ? endOfDay(endToRaw) : null;
  const membersMin = parseOptionalNumber(filters.membersMin);
  const membersMax = parseOptionalNumber(filters.membersMax);
  const consultantHoursMax = parseOptionalNumber(filters.consultantHoursMax);
  const clientHoursMax = parseOptionalNumber(filters.clientHoursMax);
  const foldersMax = parseOptionalNumber(filters.foldersMax);
  const filesMax = parseOptionalNumber(filters.filesMax);

  return projects.filter((project) => {
    if (filters.candidatesOnly && !project.migration.migrationCandidate) {
      return false;
    }

    if (!matchesDateRange(project.startDate, startFrom, startTo)) {
      return false;
    }

    if (!matchesDateRange(project.endDate, endFrom, endTo)) {
      return false;
    }

    if (!matchesMin(project.totalMemberSize, membersMin)) {
      return false;
    }

    if (membersMax !== null && (project.totalMemberSize ?? 0) > membersMax) {
      return false;
    }

    if (!matchesMax(project.migration.consultantHours, consultantHoursMax)) {
      return false;
    }

    if (!matchesMax(project.migration.clientHours, clientHoursMax)) {
      return false;
    }

    if (!matchesMax(project.docs.folders, foldersMax)) {
      return false;
    }

    if (!matchesMax(project.docs.files, filesMax)) {
      return false;
    }

    if (filters.profile !== "all" && project.migration.profile !== filters.profile) {
      return false;
    }

    switch (filters.scanStatus) {
      case "scanned":
        if (!project.docs.scanned) return false;
        break;
      case "not-scanned":
        if (project.docs.scanned || project.docs.scanStatus === "failed") return false;
        break;
      case "failed":
        if (project.docs.scanStatus !== "failed") return false;
        break;
      default:
        break;
    }

    return true;
  });
}
