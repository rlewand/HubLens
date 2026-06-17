"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardKpis } from "@/lib/dashboard-stats";
import { formatNumber } from "@/lib/utils";

export function KpiCards({
  totalProjects,
  activeProjects,
  adoptedRate,
  lastRefresh,
  docsScannedProjects,
  docsTotals,
}: DashboardKpis) {
  const docsShare = totalProjects
    ? Math.round((docsScannedProjects / totalProjects) * 100)
    : 0;

  const items = [
    {
      label: "Projects in view",
      value: formatNumber(totalProjects),
      hint: `${formatNumber(activeProjects)} active`,
    },
    {
      label: "Verified docs inventory",
      value: formatNumber(docsScannedProjects),
      hint:
        docsScannedProjects > 0
          ? `${formatNumber(docsTotals.folders)} folders · ${formatNumber(docsTotals.files)} files · ${formatNumber(docsTotals.versions)} versions (${docsShare}% of view)`
          : "Run APS scan to populate folder, file, and version counts",
    },
    {
      label: "Adopted (≥ L2)",
      value: `${adoptedRate}%`,
      hint: "At least one module adopted",
    },
    {
      label: "Data refreshed",
      value: lastRefresh,
      hint: "Latest import batch",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
