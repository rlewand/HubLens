import { NextResponse } from "next/server";
import { recoverImportBatches } from "@/lib/ingest/batch-recovery";
import { getSession } from "@/lib/session";
import { prisma } from "@hublens/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await recoverImportBatches(session.id);

  const batchId = new URL(request.url).searchParams.get("batchId");
  const batch = batchId
    ? await prisma.importBatch.findFirst({
        where: { id: batchId, userId: session.id },
      })
    : await prisma.importBatch.findFirst({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
      });

  if (!batch) {
    return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  }

  return NextResponse.json({
    batchId: batch.id,
    status: batch.status,
    projectCount: batch.projectCount,
    fileCount: batch.fileCount,
    errorMessage: batch.errorMessage,
    completedAt: batch.completedAt?.toISOString() ?? null,
  });
}
