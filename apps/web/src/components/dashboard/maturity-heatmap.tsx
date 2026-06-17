"use client";

import { MODULE_FULL_LABELS, MODULE_KEYS, MATURITY_HEX } from "@/lib/constants";
import type { ModuleDistribution } from "@/lib/dashboard-stats";
import { MATURITY_LEVEL_LABELS } from "@/lib/dashboard-stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

interface MaturityHeatmapProps {
  data: ModuleDistribution[];
  projectCount: number;
}

const LEVEL_KEYS = ["notEnabled", "provisioned", "adopted", "active", "optimized"] as const;
const LEVEL_INDEX = [0, 1, 2, 3, 4] as const;

export function MaturityHeatmap({ data, projectCount }: MaturityHeatmapProps) {
  const maxCount = Math.max(
    1,
    ...data.flatMap((row) => [
      row.notEnabled,
      row.provisioned,
      row.adopted,
      row.active,
      row.optimized,
    ]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module maturity matrix</CardTitle>
        <CardDescription>
          Project counts by maturity level across all {MODULE_KEYS.length} modules
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Module</th>
                {LEVEL_INDEX.map((level) => (
                  <th key={level} className="pb-3 px-2 text-center font-medium">
                    L{level}
                    <span className="mt-1 block text-[10px] font-normal normal-case text-muted-foreground">
                      {MATURITY_LEVEL_LABELS[level]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const counts = [
                  row.notEnabled,
                  row.provisioned,
                  row.adopted,
                  row.active,
                  row.optimized,
                ];
                return (
                  <tr key={row.moduleKey} className="border-t border-border">
                    <td className="py-3 pr-4 font-medium">
                      {MODULE_FULL_LABELS[row.moduleKey]}
                    </td>
                    {counts.map((count, index) => {
                      const intensity = count / maxCount;
                      const pct = projectCount ? Math.round((count / projectCount) * 100) : 0;
                      return (
                        <td key={LEVEL_KEYS[index]} className="px-2 py-3 text-center">
                          <div
                            className="mx-auto flex h-12 w-full min-w-[64px] max-w-[88px] flex-col items-center justify-center rounded-md border border-border/60 text-xs font-semibold"
                            style={{
                              backgroundColor: MATURITY_HEX[LEVEL_INDEX[index]],
                              opacity: count === 0 ? 0.35 : 0.55 + intensity * 0.45,
                            }}
                            title={`${formatNumber(count)} projects (${pct}%)`}
                          >
                            <span>{formatNumber(count)}</span>
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {pct}%
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
