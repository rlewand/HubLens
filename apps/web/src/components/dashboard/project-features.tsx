import { Badge } from "@/components/ui/badge";
import { MODULE_SHORT_LABELS, type ModuleKey } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/utils";
import type { ProjectFeatureUsage } from "@hublens/maturity-engine";

interface ProjectFeaturesProps {
  features: ProjectFeatureUsage[];
}

const STATUS_VARIANTS: Record<
  ProjectFeatureUsage["status"],
  "muted" | "warning" | "default" | "success"
> = {
  not_enabled: "muted",
  unused: "warning",
  adopted: "default",
  active: "success",
};

function formatTableLabel(tableKey: string): string {
  const parts = tableKey.split("_");
  if (parts.length < 2) {
    return tableKey;
  }
  return parts.slice(1).join(" ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ProjectFeatures({ features }: ProjectFeaturesProps) {
  const enabledCount = features.filter((feature) => feature.enabled).length;
  const activeCount = features.filter((feature) => feature.status === "active").length;
  const inUseCount = features.filter((feature) => feature.recordCount > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Features enabled" value={enabledCount} total={features.length} />
        <SummaryTile label="Features in use" value={inUseCount} total={features.length} />
        <SummaryTile label="Actively used" value={activeCount} total={features.length} />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4">Feature</th>
              <th className="py-2 pr-4">Module</th>
              <th className="py-2 pr-4">Enabled</th>
              <th className="py-2 pr-4">Records</th>
              <th className="py-2 pr-4">Users</th>
              <th className="py-2 pr-4">Last activity</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <FeatureRow key={feature.key} feature={feature} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {value}
        <span className="text-base font-normal text-muted-foreground"> / {total}</span>
      </p>
    </div>
  );
}

function FeatureRow({ feature }: { feature: ProjectFeatureUsage }) {
  return (
    <>
      <tr className="border-t border-border">
        <td className="py-3 pr-4">
          <p className="font-medium">{feature.displayName}</p>
          {feature.description ? (
            <p className="text-xs text-muted-foreground">{feature.description}</p>
          ) : null}
        </td>
        <td className="py-3 pr-4">
          {MODULE_SHORT_LABELS[feature.moduleKey as ModuleKey] ?? feature.moduleKey}
        </td>
        <td className="py-3 pr-4">{feature.enabled ? "Yes" : "No"}</td>
        <td className="py-3 pr-4">{formatNumber(feature.recordCount)}</td>
        <td className="py-3 pr-4">{formatNumber(feature.distinctUsers)}</td>
        <td className="py-3 pr-4">{formatDate(feature.lastActivityAt)}</td>
        <td className="py-3">
          <Badge variant={STATUS_VARIANTS[feature.status]}>{feature.statusLabel}</Badge>
        </td>
      </tr>
      {feature.relatedUsage.length > 0 ? (
        <tr className="border-t border-dashed border-border bg-muted/20">
          <td colSpan={7} className="px-4 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Related activity
            </p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {feature.relatedUsage.map((related) => (
                <div
                  key={`${feature.key}-${related.tableKey}`}
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                >
                  <p className="font-medium">{formatTableLabel(related.tableKey)}</p>
                  <p className="text-muted-foreground">
                    {formatNumber(related.recordCount)} records ·{" "}
                    {formatNumber(related.distinctUsers)} users ·{" "}
                    {formatDate(related.lastActivityAt)}
                  </p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
