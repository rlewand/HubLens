import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { MaturityCell } from "@/components/dashboard/maturity-cell";
import { ProjectFeatures } from "@/components/dashboard/project-features";
import { ProjectDocsInventory } from "@/components/dashboard/project-docs-inventory";
import { MigrationEffortBreakdown } from "@/components/dashboard/migration-effort-breakdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MODULE_SHORT_LABELS, type ModuleKey } from "@/lib/constants";
import { getProjectDetail } from "@/lib/dashboard";
import { getSession } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  buildFeatureCounts,
  buildFormatCounts,
  estimateMigration,
} from "@/lib/migration-estimate";
import type { MaturityLevel } from "@hublens/maturity-engine";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const detail = await getProjectDetail(session.id, id);
  if (!detail) {
    redirect("/dashboard");
  }

  const { project, scores, services, products, evidence, features, docsInventory, admins, batch } =
    detail;

  const activeServices = services.filter((service) => service.status === "active");
  const docsSummary = docsInventory?.summary;
  const featureCounts = buildFeatureCounts(
    Object.fromEntries(features.map((feature) => [feature.key, feature.recordCount])),
  );
  const formatCounts = buildFormatCounts(docsSummary?.formatSummary);
  const migration = estimateMigration({
    accProject: project.accProject,
    totalMemberSize: project.totalMemberSize,
    totalCompanySize: project.totalCompanySize,
    folders: docsSummary?.folderCount ?? 0,
    files: docsSummary?.fileCount ?? 0,
    versions: docsSummary?.versionCount ?? 0,
    adminCount: admins.length,
    serviceCount: activeServices.length,
    features: featureCounts,
    c4rCount: formatCounts.c4rCount,
    rvtCount: formatCounts.rvtCount,
    dwgCount: formatCounts.dwgCount,
    hasRevitOrCad: formatCounts.hasRevitOrCad,
  });

  return (
    <AppShell userName={session.name} accountName={batch.accountName}>
      <div className="space-y-6">
        <div>
          <Link href="/dashboard" className="text-sm text-accent hover:underline">
            ← Back to dashboard
          </Link>
          <h2 className="mt-2 text-2xl font-semibold">{project.name}</h2>
          <p className="text-sm text-muted-foreground">
            {project.jobNumber ?? "No job number"} · {project.status ?? "unknown status"}
            {project.startDate || project.endDate ? (
              <>
                {" "}
                · {formatDate(project.startDate?.toISOString() ?? null)} –{" "}
                {formatDate(project.endDate?.toISOString() ?? null)}
              </>
            ) : null}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader><CardTitle>Platform</CardTitle></CardHeader>
            <CardContent>
              <Badge variant={project.accProject ? "success" : "muted"}>
                {project.accProject ? "ACC" : "BIM 360"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Migration time</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{migration.consultantLabel}</p>
              <p className="text-sm text-muted-foreground">{migration.consultantHours} consultant hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Client setup</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{migration.clientLabel}</p>
              <p className="text-sm text-muted-foreground">{migration.clientHours} client team hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Migration profile</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{migration.profileLabel}</p>
              <p className="text-sm text-muted-foreground">Complexity {migration.complexityScore}/100</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Last activity</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-semibold">{formatDate(project.lastActivityAt)}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Project administrators</CardTitle>
            <CardDescription>Active project admins from the Data Connector export.</CardDescription>
          </CardHeader>
          <CardContent>
            {admins.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No project admins found. Re-import to load admin_project_users data.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin.id} className="border-t border-border">
                        <td className="py-2 pr-4">{admin.name ?? "—"}</td>
                        <td className="py-2">{admin.email ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <MigrationEffortBreakdown migration={migration} />

        {migration.involvementReasons.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Client setup considerations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {migration.involvementReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader><CardTitle>Overall maturity</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{project.overallMaturity?.toFixed(1) ?? "0.0"}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Members</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{project.totalMemberSize ?? "—"}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Companies</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{project.totalCompanySize ?? "—"}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Last activity</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-semibold">{formatDate(project.lastActivityAt)}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Module maturity & evidence</CardTitle>
            <CardDescription>Transparent scoring based on enabled services and observed usage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {scores.map((score) => {
              const metrics = score.metricsJson as {
                levelLabel?: string;
                reasons?: string[];
                recordCount?: number;
                distinctUsers?: number;
              };
              return (
                <div key={score.moduleKey} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {MODULE_SHORT_LABELS[score.moduleKey as ModuleKey] ?? score.moduleKey}
                      </p>
                      <p className="text-sm text-muted-foreground">{metrics.levelLabel}</p>
                    </div>
                    <MaturityCell level={score.level as MaturityLevel} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    <p>Records: {formatNumber(metrics.recordCount ?? 0)}</p>
                    <p>Users: {formatNumber(metrics.distinctUsers ?? 0)}</p>
                    <p>Enabled: {score.enabled ? "Yes" : "No"}</p>
                  </div>
                  {metrics.reasons?.length ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {metrics.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature adoption</CardTitle>
            <CardDescription>
              Enabled services and product usage for reviews, assets, checklists, and issues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectFeatures features={features} />
          </CardContent>
        </Card>

        {docsInventory ? (
          <ProjectDocsInventory
            summary={docsInventory.summary}
            folders={docsInventory.folders}
            files={docsInventory.files}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Enabled services</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {services.length === 0 ? (
                <p className="text-sm text-muted-foreground">No services recorded.</p>
              ) : (
                services.map((service) => (
                  <Badge key={service.id} variant={service.status === "active" ? "success" : "muted"}>
                    {service.service}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Enabled products</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products recorded.</p>
              ) : (
                products.map((product) => (
                  <Badge key={product.id} variant={product.status === "active" ? "success" : "muted"}>
                    {product.productKey}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Usage evidence tables</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4">Table</th>
                    <th className="py-2 pr-4">Records</th>
                    <th className="py-2 pr-4">Users</th>
                    <th className="py-2">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2 pr-4 font-mono text-xs">{row.tableKey}</td>
                      <td className="py-2 pr-4">{formatNumber(row.recordCount)}</td>
                      <td className="py-2 pr-4">{formatNumber(row.distinctUsers)}</td>
                      <td className="py-2">{formatDate(row.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
