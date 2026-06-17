const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      status: true,
      projectCount: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  for (const batch of batches) {
    const msg = batch.errorMessage ? batch.errorMessage.slice(0, 80) : "";
    console.log(
      `${batch.createdAt.toISOString()} ${batch.status} projects=${batch.projectCount} id=${batch.id} ${msg}`,
    );
  }

  const completed = await prisma.importBatch.findFirst({
    where: { status: "completed", projectCount: { gt: 0 } },
    orderBy: { createdAt: "desc" },
  });

  if (completed) {
    const total = await prisma.project.count({ where: { batchId: completed.id } });
    const withStart = await prisma.project.count({
      where: { batchId: completed.id, startDate: { not: null } },
    });
    console.log(
      `\nLatest completed: ${completed.id} total=${total} withStartDate=${withStart}`,
    );
  } else {
    console.log("\nNo completed batch with projects.");
  }

  const totalProjects = await prisma.project.count();
  console.log(`Total project rows (all batches): ${totalProjects}`);

  const byBatch = await prisma.project.groupBy({
    by: ["batchId"],
    _count: { _all: true },
    orderBy: { _count: { batchId: "desc" } },
    take: 10,
  });
  console.log("\nProjects per batch (top 10):");
  for (const row of byBatch) {
    console.log(`  ${row.batchId}: ${row._count._all}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
