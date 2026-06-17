/**
 * Scan and persist full APS Docs inventory for one project.
 * Usage: node scripts/scan-single-project.mjs [projectId]
 */
import { existsSync, readFileSync } from "node:fs";
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

const projectId =
  process.argv[2]?.trim() ??
  process.env.APS_DOCS_SCAN_PROJECT_IDS?.split(",")[0]?.trim() ??
  "820af33b-9af2-4778-8d34-2c08774c6ccf";

const project = await prisma.project.findFirst({
  where: { id: projectId },
  orderBy: { batch: { createdAt: "desc" } },
});

if (!project) {
  throw new Error(`Project ${projectId} not found.`);
}

console.log(`Scanning ${project.name} (${project.id})…`);
const started = Date.now();
const token = await getApsToken();

const inventory = await scanProjectDocs(token, project.accountId, project.id, {
  concurrency: 4,
  includeAllVersions: process.env.APS_INCLUDE_ALL_VERSIONS !== "false",
});

console.log(
  `Found ${inventory.folderCount} folders, ${inventory.fileCount} files, ${inventory.versionCount} versions`,
);
console.log("Top formats:", Object.entries(inventory.formatSummary).slice(0, 8));

await persistInventory(prisma, project.batchId, project.id, inventory);
console.log(`Persisted in ${((Date.now() - started) / 1000).toFixed(1)}s`);
await prisma.$disconnect();
