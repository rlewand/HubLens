import { prisma, ImportStatus } from "@hublens/db";

/** Batches still in `processing` after this window are treated as abandoned. */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

const STALE_INTERRUPTED_MESSAGE =
  "Import was interrupted (server restart or browser disconnect). Please upload again.";

export async function deleteBatchData(batchId: string): Promise<void> {
  await prisma.project.deleteMany({ where: { batchId } });
  await prisma.projectMaturityScore.deleteMany({ where: { batchId } });
  await prisma.moduleEvidence.deleteMany({ where: { batchId } });
  await prisma.projectService.deleteMany({ where: { batchId } });
  await prisma.projectProduct.deleteMany({ where: { batchId } });
  await prisma.docsInventoryScan.deleteMany({ where: { batchId } });
}

export async function recoverImportBatches(userId: string): Promise<number> {
  const threshold = new Date(Date.now() - STALE_PROCESSING_MS);
  const stale = await prisma.importBatch.findMany({
    where: {
      userId,
      status: ImportStatus.processing,
      createdAt: { lt: threshold },
    },
    select: { id: true },
  });

  for (const batch of stale) {
    await deleteBatchData(batch.id);
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.failed,
        errorMessage: STALE_INTERRUPTED_MESSAGE,
        completedAt: new Date(),
        projectCount: 0,
      },
    });
  }

  return stale.length;
}

export async function getActiveImportBatch(userId: string) {
  const threshold = new Date(Date.now() - STALE_PROCESSING_MS);
  return prisma.importBatch.findFirst({
    where: {
      userId,
      status: ImportStatus.processing,
      createdAt: { gte: threshold },
    },
    orderBy: { createdAt: "desc" },
  });
}

export { STALE_INTERRUPTED_MESSAGE };
