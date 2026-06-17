/**
 * Scan APS Docs inventory for all docs-enabled projects in a batch.
 * Usage: node scripts/scan-docs-inventory.mjs [batchId]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  getApsToken,
  loadEnvFile,
  persistInventory,
  scanProjectDocs,
} from "./lib/docs-scan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, "apps/web/.env.local"));

const require = createRequire(import.meta.url);
const { PrismaClient } = require(path.join(
  repoRoot,
  "node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client",
));
const prisma = new PrismaClient();

const batchIdArg = process.argv[2]?.trim();
const maxProjects = Number(process.env.APS_DOCS_SCAN_MAX_PROJECTS ?? "0");
const filterRaw = process.env.APS_DOCS_SCAN_PROJECT_IDS?.trim();
const projectFilter = filterRaw
  ? new Set(filterRaw.split(",").map((value) => value.trim()).filter(Boolean))
  : null;

const batch = batchIdArg
  ? await prisma.importBatch.findUnique({ where: { id: batchIdArg } })
  : await prisma.importBatch.findFirst({
      where: { status: "completed", projectCount: { gt: 0 } },
      orderBy: { createdAt: "desc" },
    });

if (!batch) {
  throw new Error("No import batch found.");
}

const services = await prisma.projectService.findMany({
  where: {
    batchId: batch.id,
    service: "documentManagement",
    status: "active",
  },
  select: { projectId: true },
});

let projectIds = [...new Set(services.map((row) => row.projectId))];
if (projectFilter) {
  projectIds = projectIds.filter((id) => projectFilter.has(id));
}
if (maxProjects > 0) {
  projectIds = projectIds.slice(0, maxProjects);
}

console.log(`Batch ${batch.id}: scanning ${projectIds.length} docs-enabled projects`);
const token = await getApsToken();

for (let index = 0; index < projectIds.length; index += 1) {
  const projectId = projectIds[index];
  const project = await prisma.project.findUnique({
    where: { batchId_id: { batchId: batch.id, id: projectId } },
  });
  if (!project) continue;

  console.log(`\n[${index + 1}/${projectIds.length}] ${project.name}`);
  try {
    const inventory = await scanProjectDocs(token, project.accountId, project.id);
    await persistInventory(prisma, batch.id, project.id, inventory);
    console.log(
      `  folders=${inventory.folderCount} files=${inventory.fileCount} versions=${inventory.versionCount}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  failed: ${message}`);
    await prisma.docsInventoryScan.upsert({
      where: { batchId_projectId: { batchId: batch.id, projectId: project.id } },
      create: { batchId: batch.id, projectId: project.id, status: "failed", errorMessage: message },
      update: { status: "failed", errorMessage: message, scannedAt: new Date() },
    });
  }
}

console.log("\nDone.");
await prisma.$disconnect();
