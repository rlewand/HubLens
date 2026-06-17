import { NextResponse } from "next/server";
import { canFetchDocsMetricsFromApi, fetchProjectDocsMetrics } from "@/lib/aps/docs-metrics";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId")?.trim();
  const projectId = searchParams.get("projectId")?.trim();
  const platform = searchParams.get("platform")?.trim() === "acc" ? "acc" : "bim360";
  const includeAllVersions = searchParams.get("includeAllVersions") === "true";

  if (!accountId || !projectId) {
    return NextResponse.json(
      { error: "accountId and projectId query parameters are required." },
      { status: 400 },
    );
  }

  if (!canFetchDocsMetricsFromApi()) {
    return NextResponse.json(
      {
        error:
          "APS_CLIENT_ID and APS_CLIENT_SECRET must be configured. The APS app must be provisioned on the target account.",
      },
      { status: 503 },
    );
  }

  try {
    const metrics = await fetchProjectDocsMetrics({
      accountId,
      projectId,
      platform,
      includeAllVersions,
    });

    return NextResponse.json({
      accountId,
      projectId,
      platform,
      ...metrics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Docs metrics request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
