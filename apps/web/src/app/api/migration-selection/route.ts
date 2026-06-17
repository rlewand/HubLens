import { NextResponse } from "next/server";
import { prisma } from "@hublens/db";
import { getSession } from "@/lib/session";

interface SelectionUpdate {
  projectId: string;
  syncDocs: boolean;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    batchId?: string;
    updates?: SelectionUpdate[];
  };

  const batchId = body.batchId?.trim();
  const updates = body.updates ?? [];

  if (!batchId || updates.length === 0) {
    return NextResponse.json({ error: "batchId and updates are required." }, { status: 400 });
  }

  if (updates.length > 500) {
    return NextResponse.json({ error: "Too many updates in one request." }, { status: 400 });
  }

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, userId: session.id },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }

  for (const update of updates) {
    const projectId = update.projectId?.trim();
    if (!projectId) {
      continue;
    }

    await prisma.projectMigrationSelection.upsert({
      where: {
        userId_batchId_projectId: {
          userId: session.id,
          batchId,
          projectId,
        },
      },
      create: {
        userId: session.id,
        batchId,
        projectId,
        syncDocs: Boolean(update.syncDocs),
      },
      update: {
        syncDocs: Boolean(update.syncDocs),
      },
    });
  }

  return NextResponse.json({ ok: true, count: updates.length });
}
