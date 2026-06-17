"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdoptionItem } from "@/lib/dashboard-stats";
import { formatNumber } from "@/lib/utils";

interface ServiceLandscapeProps {
  services: AdoptionItem[];
  products: AdoptionItem[];
}

function AdoptionPanel({
  title,
  description,
  items,
  color,
}: {
  title: string;
  description: string;
  items: AdoptionItem[];
  color: string;
}) {
  const chartData = items.slice(0, 12).map((item) => ({
    name: item.label,
    count: item.count,
    percentage: item.percentage,
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data in current filter.</p>
        ) : (
          <>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number, _name, payload) => {
                      const pct = payload?.payload?.percentage ?? 0;
                      return [`${formatNumber(value)} projects (${pct}%)`, "Enabled"];
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 text-right">Projects</th>
                    <th className="px-3 py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.key} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{item.label}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(item.count)}</td>
                      <td className="px-3 py-2 text-right">{item.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ServiceLandscape({ services, products }: ServiceLandscapeProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <AdoptionPanel
        title="Account services"
        description="Active service entitlements across filtered projects"
        items={services}
        color="#0696d7"
      />
      <AdoptionPanel
        title="Licensed products"
        description="Active product licenses across filtered projects"
        items={products}
        color="#7c3aed"
      />
    </div>
  );
}
