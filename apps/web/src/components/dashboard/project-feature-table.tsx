"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FeatureColumnWithTotals } from "@/lib/dashboard-stats";
import type { DashboardProjectRow } from "@/lib/dashboard-stats";
import { formatDate, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ProjectFeatureTableProps {
  projects: DashboardProjectRow[];
  featureColumns: FeatureColumnWithTotals[];
}

type SortKey = "name" | "platform" | "status" | "total" | string;
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 50;

export function ProjectFeatureTable({ projects, featureColumns }: ProjectFeatureTableProps) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [onlyWithActivity, setOnlyWithActivity] = useState(false);

  const sorted = useMemo(() => {
    let rows = [...projects];

    if (onlyWithActivity) {
      rows = rows.filter((project) =>
        featureColumns.some((column) => (project.features[column.key] ?? 0) > 0),
      );
    }

    rows.sort((a, b) => {
      let comparison = 0;

      if (sortKey === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortKey === "platform") {
        comparison = Number(b.accProject) - Number(a.accProject);
      } else if (sortKey === "status") {
        comparison = (a.status ?? "").localeCompare(b.status ?? "");
      } else if (sortKey === "total") {
        comparison = featureTotal(a, featureColumns) - featureTotal(b, featureColumns);
      } else {
        comparison = (a.features[sortKey] ?? 0) - (b.features[sortKey] ?? 0);
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return rows;
  }, [projects, featureColumns, onlyWithActivity, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [projects, onlyWithActivity, sortKey, sortDirection]);

  useEffect(() => {
    if (
      sortKey !== "name" &&
      sortKey !== "platform" &&
      sortKey !== "status" &&
      sortKey !== "total" &&
      !featureColumns.some((column) => column.key === sortKey)
    ) {
      setSortKey("name");
      setSortDirection("asc");
    }
  }, [featureColumns, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "name" ? "asc" : "desc");
  }

  if (featureColumns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No feature columns to display. All configured features have zero records in this view.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {sorted.length.toLocaleString()} projects · page {currentPage} of {totalPages}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyWithActivity}
            onChange={(event) => setOnlyWithActivity(event.target.checked)}
            className="rounded border-border"
          />
          Only projects with feature activity
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortHeader label="Project" sortKey="name" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Platform" sortKey="platform" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              <SortHeader label="Status" sortKey="status" active={sortKey} direction={sortDirection} onSort={toggleSort} />
              {featureColumns.map((column) => (
                <SortHeader
                  key={column.key}
                  label={column.label}
                  sortKey={column.key}
                  active={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                  align="right"
                />
              ))}
              <SortHeader label="Total" sortKey="total" active={sortKey} direction={sortDirection} onSort={toggleSort} align="right" />
              <th className="px-4 py-3 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((project) => {
              const total = featureTotal(project, featureColumns);
              return (
                <tr key={project.id} className="border-t border-border hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {project.name}
                    </Link>
                    {project.jobNumber ? (
                      <p className="text-xs text-muted-foreground">{project.jobNumber}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={project.accProject ? "default" : "muted"}>
                      {project.accProject ? "ACC" : "BIM 360"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={project.status === "active" ? "success" : "muted"}>
                      {project.status ?? "unknown"}
                    </Badge>
                  </td>
                  {featureColumns.map((column) => (
                    <td key={column.key} className="px-4 py-3 text-right tabular-nums">
                      <FeatureCount value={project.features[column.key] ?? 0} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatNumber(total)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatDate(project.lastActivityAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          className="rounded-md border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </p>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          className="rounded-md border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function featureTotal(
  project: DashboardProjectRow,
  columns: FeatureColumnWithTotals[],
): number {
  return columns.reduce((sum, column) => sum + (project.features[column.key] ?? 0), 0);
}

function FeatureCount({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  return (
    <span className={cn(value >= 100 ? "font-semibold text-foreground" : "text-foreground")}>
      {formatNumber(value)}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={cn("px-4 py-3 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          isActive && "text-foreground",
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5 opacity-60" />
      </button>
    </th>
  );
}
