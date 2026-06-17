"use client";

import { useMemo, useState } from "react";
import { FilterBar, type PortfolioStatusFilter } from "@/components/dashboard/filter-bar";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { MigrationPortfolioTable } from "@/components/dashboard/migration-portfolio-table";
import { MaturityDistribution } from "@/components/dashboard/maturity-distribution";
import { MaturityHeatmap } from "@/components/dashboard/maturity-heatmap";
import { ProjectFeatureTable } from "@/components/dashboard/project-feature-table";
import { ProjectTable } from "@/components/dashboard/project-table";
import { ServiceLandscape } from "@/components/dashboard/service-landscape";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildActiveFeatureColumns,
  computeDashboardStats,
  filterProjects,
  type DashboardProjectRow,
} from "@/lib/dashboard-stats";
import { sumSelectedEffort } from "@/lib/migration-estimate";
import type { FeatureColumnDef } from "@hublens/maturity-engine";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  batchId: string;
  projects: DashboardProjectRow[];
  featureColumns: FeatureColumnDef[];
  lastRefresh: string;
}

type PortfolioView = "migration" | "features" | "modules" | "analytics";

export function DashboardView({ batchId, projects, featureColumns, lastRefresh }: DashboardViewProps) {
  const [status, setStatus] = useState<PortfolioStatusFilter>("active");
  const [search, setSearch] = useState("");
  const [portfolioView, setPortfolioView] = useState<PortfolioView>("migration");

  const bim360Projects = useMemo(
    () => projects.filter((project) => !project.accProject),
    [projects],
  );

  const filteredProjects = useMemo(
    () => filterProjects(bim360Projects, "all", status, search),
    [bim360Projects, status, search],
  );

  const stats = useMemo(
    () => computeDashboardStats(filteredProjects, lastRefresh),
    [filteredProjects, lastRefresh],
  );

  const { active: activeFeatureColumns, hidden: hiddenFeatureColumns } = useMemo(
    () => buildActiveFeatureColumns(filteredProjects, featureColumns),
    [filteredProjects, featureColumns],
  );

  const migrationSummary = useMemo(() => {
    const scanned = filteredProjects.filter((project) => project.docs.scanned);
    const docsTotals = scanned.reduce(
      (totals, project) => ({
        folders: totals.folders + project.docs.folders,
        files: totals.files + project.docs.files,
        versions: totals.versions + project.docs.versions,
      }),
      { folders: 0, files: 0, versions: 0 },
    );

    return {
      bim360Count: filteredProjects.length,
      selectedEffort: sumSelectedEffort(filteredProjects),
      scannedCount: scanned.length,
      docsTotals,
    };
  }, [filteredProjects]);

  return (
    <div className="space-y-6">
      <FilterBar
        status={status}
        search={search}
        totalCount={bim360Projects.length}
        filteredCount={filteredProjects.length}
        onStatusChange={setStatus}
        onSearchChange={setSearch}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">BIM 360 projects</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{migrationSummary.bim360Count}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Est. migration time</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{Math.round(migrationSummary.selectedEffort)}h</p>
            <p className="text-xs text-muted-foreground">Consultant delivery · selected projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Verified docs inventory</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{migrationSummary.scannedCount}</p>
            <p className="text-xs text-muted-foreground">
              {migrationSummary.scannedCount > 0
                ? `${migrationSummary.docsTotals.folders.toLocaleString()} folders · ${migrationSummary.docsTotals.files.toLocaleString()} files · ${migrationSummary.docsTotals.versions.toLocaleString()} versions`
                : "No APS scans yet — select projects and scan from the Migration tab"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Portfolio overview</CardTitle>
            <CardDescription>
              {portfolioView === "migration"
                ? "Compare BIM 360 projects, select docs sync targets, and estimate ACC migration effort."
                : portfolioView === "features"
                  ? "Feature record counts across projects."
                  : portfolioView === "modules"
                    ? "Module maturity levels across the portfolio."
                    : "Module maturity and service adoption for BIM 360 projects."}
            </CardDescription>
          </div>
          <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-1">
            {(
              [
                { value: "migration" as const, label: "Migration" },
                { value: "features" as const, label: "Features" },
                { value: "modules" as const, label: "Modules" },
                { value: "analytics" as const, label: "Analytics" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPortfolioView(option.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  portfolioView === option.value
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {portfolioView === "migration" ? (
            <MigrationPortfolioTable batchId={batchId} projects={filteredProjects} />
          ) : portfolioView === "features" ? (
            <ProjectFeatureTable projects={filteredProjects} featureColumns={activeFeatureColumns} />
          ) : portfolioView === "modules" ? (
            <ProjectTable
              projects={filteredProjects}
              hideFilters
              platform="bim360"
              status={status}
              search={search}
            />
          ) : (
            <div className="space-y-6">
              <KpiCards {...stats.kpis} />
              <MaturityDistribution data={stats.distribution} projectCount={stats.kpis.totalProjects} />
              <ServiceLandscape services={stats.services} products={stats.products} />
              <MaturityHeatmap data={stats.distribution} projectCount={stats.kpis.totalProjects} />
            </div>
          )}
        </CardContent>
      </Card>

      {portfolioView === "features" && hiddenFeatureColumns.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Hidden features (no records): {hiddenFeatureColumns.map((column) => column.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
