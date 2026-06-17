"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { MigrationPortfolioFilterBar } from "@/components/dashboard/migration-portfolio-filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardProjectRow } from "@/lib/dashboard-stats";
import {
  applyMigrationPortfolioFilters,
  DEFAULT_MIGRATION_FILTERS,
  type MigrationPortfolioFilters,
} from "@/lib/migration-portfolio-filters";
import { sumSelectedEffort, sumSelectedClientEffort } from "@/lib/migration-estimate";
import { formatDate, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface MigrationPortfolioTableProps {
  batchId: string;
  projects: DashboardProjectRow[];
}

type SortKey =
  | "name"
  | "startDate"
  | "endDate"
  | "lastActivity"
  | "members"
  | "folders"
  | "files"
  | "versions"
  | "effort"
  | "clientEffort"
  | "drivers"
  | "scanned";

type SortDirection = "asc" | "desc";

const PAGE_SIZE = 50;

const PROFILE_VARIANT: Record<
  DashboardProjectRow["migration"]["profile"],
  "success" | "muted" | "default"
> = {
  "docs-only": "success",
  standard: "muted",
  "workflow-heavy": "default",
  "rcw-critical": "default",
};

export function MigrationPortfolioTable({
  batchId,
  projects: initialProjects,
}: MigrationPortfolioTableProps) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filters, setFilters] = useState<MigrationPortfolioFilters>(DEFAULT_MIGRATION_FILTERS);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const filtered = useMemo(
    () => applyMigrationPortfolioFilters(projects, filters),
    [projects, filters],
  );

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "startDate":
          comparison =
            new Date(a.startDate ?? 0).getTime() - new Date(b.startDate ?? 0).getTime();
          break;
        case "endDate":
          comparison = new Date(a.endDate ?? 0).getTime() - new Date(b.endDate ?? 0).getTime();
          break;
        case "lastActivity":
          comparison =
            new Date(a.lastActivityAt ?? 0).getTime() -
            new Date(b.lastActivityAt ?? 0).getTime();
          break;
        case "members":
          comparison = (a.totalMemberSize ?? 0) - (b.totalMemberSize ?? 0);
          break;
        case "folders":
          comparison = a.docs.folders - b.docs.folders;
          break;
        case "files":
          comparison = a.docs.files - b.docs.files;
          break;
        case "versions":
          comparison = a.docs.versions - b.docs.versions;
          break;
        case "effort":
          comparison = a.migration.consultantHours - b.migration.consultantHours;
          break;
        case "clientEffort":
          comparison = a.migration.clientHours - b.migration.clientHours;
          break;
        case "drivers":
          comparison = a.migration.profile.localeCompare(b.migration.profile);
          break;
        case "scanned":
          comparison = Number(a.docs.scanned) - Number(b.docs.scanned);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return rows;
  }, [filtered, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectedCount = projects.filter((project) => project.syncDocs).length;
  const selectedEffort = sumSelectedEffort(projects);
  const selectedClientEffort = sumSelectedClientEffort(projects);

  const visibleSelected = pageItems.filter((project) => project.syncDocs).length;
  const allVisibleSelected = pageItems.length > 0 && visibleSelected === pageItems.length;

  useEffect(() => {
    setPage(1);
  }, [filters, sortKey, sortDirection, projects.length]);

  const updateSelection = useCallback(
    (updates: Array<{ projectId: string; syncDocs: boolean }>) => {
      startTransition(async () => {
        const response = await fetch("/api/migration-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, updates }),
        });
        if (!response.ok) {
          return;
        }
        const updateMap = new Map(updates.map((item) => [item.projectId, item.syncDocs]));
        setProjects((current) =>
          current.map((project) =>
            updateMap.has(project.id)
              ? { ...project, syncDocs: updateMap.get(project.id) ?? project.syncDocs }
              : project,
          ),
        );
      });
    },
    [batchId],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "name" ? "asc" : "desc");
  }

  function toggleProject(projectId: string, syncDocs: boolean) {
    updateSelection([{ projectId, syncDocs }]);
  }

  function toggleVisible(checked: boolean) {
    updateSelection(pageItems.map((project) => ({ projectId: project.id, syncDocs: checked })));
  }

  function selectAllVisible() {
    updateSelection(pageItems.map((project) => ({ projectId: project.id, syncDocs: true })));
  }

  function clearSelection() {
    updateSelection(
      projects
        .filter((project) => project.syncDocs)
        .map((project) => ({ projectId: project.id, syncDocs: false })),
    );
  }

  async function scanSelected() {
    const selectedIds = projects.filter((project) => project.syncDocs).map((project) => project.id);
    if (selectedIds.length === 0) {
      setScanMessage("Select at least one project to scan.");
      return;
    }

    setScanning(true);
    let completed = 0;
    let failed = 0;

    try {
      for (let offset = 0; offset < selectedIds.length; offset += 10) {
        const chunk = selectedIds.slice(offset, offset + 10);
      setScanMessage(
        `Scanning ${offset + 1}–${offset + chunk.length} of ${selectedIds.length} project(s)… large projects can take 5–15 minutes.`,
      );

        const response = await fetch("/api/docs-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, projectIds: chunk, mode: "auto" }),
          signal: AbortSignal.timeout(20 * 60 * 1000),
        });
        const payload = (await response.json()) as {
          error?: string;
          completed?: number;
          failed?: number;
        };
        if (!response.ok) {
          setScanMessage(payload.error ?? "Docs scan failed.");
          return;
        }
        completed += payload.completed ?? 0;
        failed += payload.failed ?? 0;
      }

      setScanMessage(
        failed > 0
          ? `Scan complete: ${completed} succeeded, ${failed} failed. Quota errors? Wait a few minutes or set APS_INCLUDE_ALL_VERSIONS=false. Refreshing…`
          : `Scan complete: ${completed} succeeded. Refreshing…`,
      );
      router.refresh();
    } catch {
      setScanMessage("Docs scan request failed.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {sorted.length.toLocaleString()} projects · {selectedCount} selected for docs sync
            {selectedCount > 0
              ? ` · ~${Math.round(selectedEffort)}h migration + ~${Math.round(selectedClientEffort)}h client setup`
              : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Select BIM 360 projects to synchronize folders and files before ACC migration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={scanSelected}
            disabled={pending || scanning || selectedCount === 0}
          >
            {scanning ? "Scanning…" : "Scan folders, files & versions"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={selectAllVisible} disabled={pending || scanning}>
            Select visible
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={clearSelection} disabled={pending || scanning}>
            Clear selection
          </Button>
        </div>
      </div>

      {scanMessage ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {scanMessage}
        </p>
      ) : null}

      <MigrationPortfolioFilterBar
        filters={filters}
        onChange={setFilters}
        totalCount={projects.length}
        filteredCount={filtered.length}
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleVisible(event.target.checked)}
                  aria-label="Select visible projects"
                  className="rounded border-border"
                />
              </th>
              <SortHeader label="Project" sortKey="name" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Start" sortKey="startDate" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="End" sortKey="endDate" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Last activity" sortKey="lastActivity" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Docs scan" sortKey="scanned" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Members" sortKey="members" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Folders" sortKey="folders" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Files" sortKey="files" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Versions" sortKey="versions" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Migration time" sortKey="effort" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Client setup" sortKey="clientEffort" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Key drivers" sortKey="drivers" active={sortKey} direction={sortDirection} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((project) => (
              <tr key={project.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={project.syncDocs}
                    disabled={pending}
                    onChange={(event) => toggleProject(project.id, event.target.checked)}
                    className="rounded border-border"
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/dashboard/projects/${project.id}`} className="font-medium text-accent hover:underline">
                    {project.name}
                  </Link>
                  {project.jobNumber ? (
                    <p className="text-xs text-muted-foreground">{project.jobNumber}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(project.startDate)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(project.endDate)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(project.lastActivityAt)}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      project.docs.scanStatus === "failed"
                        ? "default"
                        : project.docs.scanned
                          ? "success"
                          : project.docs.scanStatus === "scanning"
                            ? "muted"
                            : "muted"
                    }
                    title={project.docs.scanError ?? undefined}
                  >
                    {project.docs.scanStatus === "failed"
                      ? "Scan failed"
                      : project.docs.scanStatus === "scanning"
                        ? "Scanning…"
                        : project.docs.scanned
                          ? "Scanned"
                          : "Not scanned"}
                  </Badge>
                  {project.docs.scanStatus === "failed" && project.docs.scanError ? (
                    <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={project.docs.scanError}>
                      {project.docs.scanError.includes("429") || project.docs.scanError.includes("Quota")
                        ? "APS quota exceeded — wait and retry"
                        : project.docs.scanError}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">{project.totalMemberSize ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{formatNumber(project.docs.folders)}</td>
                <td className="px-3 py-2 tabular-nums">{formatNumber(project.docs.files)}</td>
                <td className="px-3 py-2 tabular-nums">{formatNumber(project.docs.versions)}</td>
                <td className="px-3 py-2">
                  <p>{project.migration.consultantLabel}</p>
                  <p className="text-xs text-muted-foreground">{project.migration.consultantHours}h consultant</p>
                </td>
                <td className="px-3 py-2">
                  <p>{project.migration.clientLabel}</p>
                  <p className="text-xs text-muted-foreground">{project.migration.clientHours}h client team</p>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={PROFILE_VARIANT[project.migration.profile]}>
                    {project.migration.profileLabel}
                  </Badge>
                  <p
                    className="mt-1 max-w-[220px] text-xs text-muted-foreground"
                    title={project.migration.effortFactors
                      .map(
                        (factor) =>
                          `${factor.label}: ${factor.consultantHours}h consultant / ${factor.clientHours}h client`,
                      )
                      .join("\n")}
                  >
                    {project.migration.driverSummary}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Estimates calibrated to SP0390 (Breslauer Straße School Complex): consultant tasks scale by item
        count (minutes to ~4h); client time is RVT cloud model support and Formsi checklist configuration only.
        Hover key drivers for per-factor breakdown.
      </p>

      <div className="flex items-center justify-between text-sm">
        <p>
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className="px-3 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-accent" : "opacity-40")} />
      </button>
    </th>
  );
}
