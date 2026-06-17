"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MaturityLevel } from "@hublens/maturity-engine";
import { MaturityCell } from "@/components/dashboard/maturity-cell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MODULE_KEYS, MODULE_SHORT_LABELS, type ModuleKey } from "@/lib/constants";
import type { DashboardProjectRow, PlatformFilter } from "@/lib/dashboard-stats";
import { formatDate } from "@/lib/utils";

export interface ProjectRow {
  id: string;
  name: string;
  jobNumber: string | null;
  status: string | null;
  accProject: boolean;
  totalMemberSize: number | null;
  overallMaturity: number | null;
  startDate: string | null;
  endDate: string | null;
  lastActivityAt: string | null;
  maturity: Partial<Record<ModuleKey, MaturityLevel>>;
}

interface ProjectTableProps {
  projects: DashboardProjectRow[];
  hideFilters?: boolean;
  platform?: PlatformFilter;
  status?: string;
  search?: string;
}

const PAGE_SIZE = 25;

export function ProjectTable({
  projects,
  hideFilters = false,
  platform = "all",
  status: externalStatus,
  search: externalSearch,
}: ProjectTableProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalStatus, setInternalStatus] = useState("all");
  const [page, setPage] = useState(1);

  const search = hideFilters ? (externalSearch ?? "") : internalSearch;
  const status = hideFilters ? (externalStatus ?? "all") : internalStatus;

  const filtered = useMemo(() => {
    if (hideFilters) {
      return projects;
    }

    const query = search.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesSearch =
        query === "" ||
        project.name.toLowerCase().includes(query) ||
        (project.jobNumber?.toLowerCase().includes(query) ?? false);

      const matchesStatus =
        status === "all" || (project.status ?? "").toLowerCase() === status.toLowerCase();

      const matchesPlatform =
        platform === "all" ||
        (platform === "acc" && project.accProject) ||
        (platform === "bim360" && !project.accProject);

      return matchesSearch && matchesStatus && matchesPlatform;
    });
  }, [projects, search, status, platform, hideFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, status, platform, projects]);

  return (
    <div className="space-y-4">
      {!hideFilters ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search by project name or job number"
            value={internalSearch}
            onChange={(event) => {
              setInternalSearch(event.target.value);
              setPage(1);
            }}
            className="md:max-w-sm"
          />
          <select
            value={internalStatus}
            onChange={(event) => {
              setInternalStatus(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border border-border bg-white px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <p className="text-sm text-muted-foreground md:ml-auto">
            Showing {pageItems.length} of {filtered.length} projects
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages} · {filtered.length.toLocaleString()} projects
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Members</th>
              {MODULE_KEYS.map((moduleKey) => (
                <th key={moduleKey} className="px-2 py-3 text-center">
                  {MODULE_SHORT_LABELS[moduleKey]}
                </th>
              ))}
              <th className="px-4 py-3">Overall</th>
              <th className="px-4 py-3">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((project) => (
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
                <td className="px-4 py-3">{project.totalMemberSize ?? "—"}</td>
                {MODULE_KEYS.map((moduleKey) => (
                  <td key={moduleKey} className="px-2 py-3 text-center">
                    <MaturityCell level={project.maturity[moduleKey] ?? 0} />
                  </td>
                ))}
                <td className="px-4 py-3 font-semibold">
                  {project.overallMaturity?.toFixed(1) ?? "0.0"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(project.lastActivityAt)}</td>
              </tr>
            ))}
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
