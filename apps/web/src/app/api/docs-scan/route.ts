import { NextResponse } from "next/server";
import { isApsConfigured } from "@/lib/aps/auth";
import { executeProjectDocsScan } from "@/lib/aps/enrich-docs";
import { markDocsScanFailed } from "@/lib/aps/persist-inventory";
import { prisma } from "@hublens/db";
import { getSession } from "@/lib/session";

const MAX_PROJECTS_PER_REQUEST = 10;

export const maxDuration = 900;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isApsConfigured()) {
    return NextResponse.json(
      { error: "APS credentials are not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    batchId?: string;
    projectId?: string;
    projectIds?: string[];
    mode?: "full" | "metrics" | "auto";
  };

  const batchId = body.batchId?.trim();
  const projectIds = (
    body.projectIds ??
    (body.projectId ? [body.projectId] : [])
  )
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (!batchId || projectIds.length === 0) {
    return NextResponse.json(
      { error: "batchId and at least one projectId are required." },
      { status: 400 },
    );
  }

  if (projectIds.length > MAX_PROJECTS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Scan at most ${MAX_PROJECTS_PER_REQUEST} projects per request.`,
      },
      { status: 400 },
    );
  }

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, userId: session.id },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }

  const projects = await prisma.project.findMany({
    where: { batchId, id: { in: projectIds } },
  });

  const results: Array<{
    projectId: string;
    status: "completed" | "failed";
    metrics?: {
      folders: number;
      files: number;
      versions: number;
    };
    error?: string;
  }> = [];

  for (const project of projects) {
    try {
      const metrics = await executeProjectDocsScan(
        {
          batchId,
          projectId: project.id,
          accountId: project.accountId,
          platform: project.accProject ? "acc" : "bim360",
        },
        undefined,
        body.mode ?? "auto",
      );
      results.push({
        projectId: project.id,
        status: "completed",
        metrics: {
          folders: metrics.folders,
          files: metrics.files,
          versions: metrics.versions,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Docs scan failed.";
      await markDocsScanFailed(batchId, project.id, message);
      results.push({
        projectId: project.id,
        status: "failed",
        error: message,
      });
    }
  }

  const completed = results.filter((result) => result.status === "completed").length;
  return NextResponse.json({
    batchId,
    completed,
    failed: results.length - completed,
    results,
  });
}
