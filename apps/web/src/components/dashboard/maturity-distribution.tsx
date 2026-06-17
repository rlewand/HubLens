"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MODULE_FULL_LABELS, MATURITY_HEX } from "@/lib/constants";
import type { ModuleDistribution } from "@/lib/dashboard-stats";
import { MATURITY_LEVEL_LABELS } from "@/lib/dashboard-stats";
import { formatNumber } from "@/lib/utils";

interface MaturityDistributionProps {
  data: ModuleDistribution[];
  projectCount: number;
}

const SERIES = [
  { key: "notEnabled", label: MATURITY_LEVEL_LABELS[0], level: 0 as const },
  { key: "provisioned", label: MATURITY_LEVEL_LABELS[1], level: 1 as const },
  { key: "adopted", label: MATURITY_LEVEL_LABELS[2], level: 2 as const },
  { key: "active", label: MATURITY_LEVEL_LABELS[3], level: 3 as const },
  { key: "optimized", label: MATURITY_LEVEL_LABELS[4], level: 4 as const },
];

export function MaturityDistribution({ data = [], projectCount }: MaturityDistributionProps) {
  const chartData = data.map((item) => ({
    module: MODULE_FULL_LABELS[item.moduleKey],
    [MATURITY_LEVEL_LABELS[0]]: item.notEnabled,
    [MATURITY_LEVEL_LABELS[1]]: item.provisioned,
    [MATURITY_LEVEL_LABELS[2]]: item.adopted,
    [MATURITY_LEVEL_LABELS[3]]: item.active,
    [MATURITY_LEVEL_LABELS[4]]: item.optimized,
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Maturity by module</CardTitle>
        <CardDescription>
          Full level distribution across {formatNumber(projectCount)} projects
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="module"
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={70}
              tick={{ fontSize: 11 }}
            />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip formatter={(value: number) => formatNumber(value)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.label}
                stackId="maturity"
                fill={MATURITY_HEX[series.level]}
                radius={
                  index === SERIES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
