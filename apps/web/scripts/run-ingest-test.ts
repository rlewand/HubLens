import { runIngest } from "../src/lib/ingest/importer";
import { resolveCsvExportRoot } from "../src/lib/ingest/zip";

const extractDir =
  ".uploads/cmqf3wkpc0000laswekzhkm70/1781526049809/extracted";
const userId = "cmqf3wkpc0000laswekzhkm70";

const csvRoot = await resolveCsvExportRoot(extractDir);
console.log("csvRoot:", csvRoot);

const result = await runIngest(userId, csvRoot);
console.log("batchId:", result.batchId, "projectCount:", result.projectCount);

const { prisma } = await import("@hublens/db");
const batch = await prisma.importBatch.findUnique({ where: { id: result.batchId } });
const projectCount = await prisma.project.count({ where: { batchId: result.batchId } });
console.log("project_count field:", batch?.projectCount);
console.log("actual projects:", projectCount);

await prisma.$disconnect();
