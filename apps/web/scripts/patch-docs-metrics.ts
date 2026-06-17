import { prisma } from "@hublens/db";
import { fetchProjectDocsMetrics } from "../src/lib/aps/docs-metrics";

const projectId =
  process.argv[2] ??
  process.env.APS_DOCS_METRICS_PROJECT_IDS?.split(",")[0]?.trim() ??
  "820af33b-9af2-4778-8d34-2c08774c6ccf";

const TABLE_KEYS = {
  folders: "docs_content_folders",
  files: "docs_content_files",
  versions: "docs_content_versions",
} as const;

const project = await prisma.project.findFirst({
  where: { id: projectId },
  orderBy: { batch: { createdAt: "desc" } },
  include: { batch: true },
});

if (!project) {
  throw new Error(`Project ${projectId} not found. Run an import first.`);
}

console.log(`Patching batch ${project.batchId} — ${project.name}`);

const metrics = await fetchProjectDocsMetrics({
  accountId: project.accountId,
  projectId: project.id,
  platform: project.accProject ? "acc" : "bim360",
});

console.log("Live metrics:", metrics);

for (const [key, tableKey] of Object.entries(TABLE_KEYS)) {
  const recordCount = metrics[key as keyof typeof TABLE_KEYS];
  if (recordCount <= 0) continue;

  await prisma.moduleEvidence.upsert({
    where: {
      batchId_projectId_moduleKey_tableKey: {
        batchId: project.batchId,
        projectId: project.id,
        moduleKey: "docs",
        tableKey,
      },
    },
    create: {
      batchId: project.batchId,
      projectId: project.id,
      moduleKey: "docs",
      tableKey,
      recordCount,
      distinctUsers: 0,
      lastActivityAt: null,
    },
    update: { recordCount },
  });
  console.log(`  Updated ${tableKey}: ${recordCount}`);
}

console.log("Done.");
await prisma.$disconnect();
