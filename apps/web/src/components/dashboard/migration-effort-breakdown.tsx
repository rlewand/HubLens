import type { MigrationEffortFactor, MigrationEstimate } from "@/lib/migration-estimate";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SEVERITY_VARIANT: Record<
  MigrationEffortFactor["severity"],
  "success" | "muted" | "default"
> = {
  low: "success",
  medium: "muted",
  high: "default",
  critical: "default",
};

interface MigrationEffortBreakdownProps {
  migration: MigrationEstimate;
  compact?: boolean;
}

export function MigrationEffortBreakdown({
  migration,
  compact = false,
}: MigrationEffortBreakdownProps) {
  if (compact) {
    return (
      <div className="space-y-1">
        <p className="font-medium">{migration.driverSummary}</p>
        <p className="text-xs text-muted-foreground">{migration.profileLabel} profile</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Migration effort breakdown</CardTitle>
        <CardDescription>
          {migration.profileLabel} profile · calibrated to SP0390 benchmark · consultant delivery vs
          client RVT/Formsi setup
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Migration time (consultant)</p>
            <p className="text-2xl font-semibold">{migration.consultantLabel}</p>
            <p className="text-sm text-muted-foreground">{migration.consultantHours} hours</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Client setup time</p>
            <p className="text-2xl font-semibold">{migration.clientLabel}</p>
            <p className="text-sm text-muted-foreground">{migration.clientHours} hours</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Factor</th>
                <th className="px-3 py-2">Impact</th>
                <th className="px-3 py-2 text-right">Consultant</th>
                <th className="px-3 py-2 text-right">Client</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {migration.effortFactors.map((factor) => (
                <tr key={factor.key} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium">{factor.label}</td>
                  <td className="px-3 py-2">
                    <Badge variant={SEVERITY_VARIANT[factor.severity]}>{factor.severity}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{factor.consultantHours}h</td>
                  <td className="px-3 py-2 text-right tabular-nums">{factor.clientHours}h</td>
                  <td className="px-3 py-2 text-muted-foreground">{factor.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
