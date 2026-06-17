const { PrismaClient, ImportStatus } = require("@prisma/client");

const prisma = new PrismaClient();
const STALE_MS = 15 * 60 * 1000;
const STALE_MESSAGE =
  "Import was interrupted (server restart or browser disconnect). Please upload again.";

async function deleteBatchData(batchId) {
  await prisma.project.deleteMany({ where: { batchId } });
  await prisma.projectMaturityScore.deleteMany({ where: { batchId } });
  await prisma.moduleEvidence.deleteMany({ where: { batchId } });
  await prisma.projectService.deleteMany({ where: { batchId } });
  await prisma.projectProduct.deleteMany({ where: { batchId } });
  await prisma.docsInventoryScan.deleteMany({ where: { batchId } });
}

async function recoverStale() {
  const threshold = new Date(Date.now() - STALE_MS);
  const stale = await prisma.importBatch.findMany({
    where: {
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
        errorMessage: STALE_MESSAGE,
        completedAt: new Date(),
        projectCount: 0,
      },
    });
    console.log(`Recovered stale batch ${batch.id}`);
  }

  return stale.length;
}

recoverStale()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
