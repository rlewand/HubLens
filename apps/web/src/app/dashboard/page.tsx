import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData, getLatestImportAttempt } from "@/lib/dashboard";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [data, latestAttempt] = await Promise.all([
    getDashboardData(session.id),
    getLatestImportAttempt(session.id),
  ]);

  const latestFailed =
    latestAttempt &&
    latestAttempt.status === "failed" &&
    latestAttempt.id !== data?.batch.id;

  const latestProcessing =
    latestAttempt?.status === "processing" &&
    latestAttempt.id !== data?.batch.id;

  const latestEmpty =
    latestAttempt &&
    latestAttempt.status === "completed" &&
    latestAttempt.projectCount === 0 &&
    latestAttempt.id !== data?.batch.id;

  return (
    <AppShell
      userName={session.name}
      accountName={data?.batch.accountName}
      exportDate={data?.exportDate}
    >
      {!data ? (
        <Card>
          <CardHeader>
            <CardTitle>No data loaded yet</CardTitle>
            <CardDescription>
              {latestAttempt?.status === "processing"
                ? "Your latest import is still running. Refresh this page in a few minutes, or go to Data Upload to monitor progress."
                : latestAttempt?.status === "failed"
                ? (latestAttempt.errorMessage ??
                  "Your last import failed. Try uploading the ZIP export again.")
                : latestAttempt?.projectCount === 0
                  ? "Your last import did not contain any projects. Import a valid ACC Data Connector CSV export."
                  : "Import your ACC Data Connector CSV export to generate the maturity dashboard."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/uploads">
              <Button>Go to Data Upload</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {latestFailed || latestEmpty || latestProcessing ? (
            <Card
              className={
                latestProcessing
                  ? "border-blue-200 bg-blue-50"
                  : "border-amber-200 bg-amber-50"
              }
            >
              <CardHeader className="pb-2">
                <CardTitle
                  className={`text-base ${
                    latestProcessing ? "text-blue-900" : "text-amber-900"
                  }`}
                >
                  {latestProcessing
                    ? "Import in progress"
                    : "Latest import did not load projects"}
                </CardTitle>
                <CardDescription
                  className={latestProcessing ? "text-blue-800" : "text-amber-800"}
                >
                  {latestProcessing
                    ? "A new import is running in the background. This page shows your last successful dataset until it completes."
                    : (latestAttempt?.errorMessage ??
                      "The most recent upload finished without any projects. Showing data from your last successful import below.")}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          <DashboardView
            batchId={data.batch.id}
            projects={data.projectRows}
            featureColumns={data.featureColumns}
            lastRefresh={data.lastRefresh}
          />
        </div>
      )}
    </AppShell>
  );
}
