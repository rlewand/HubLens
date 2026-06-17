import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const { PrismaClient } = require(path.join(
  repoRoot,
  "node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client",
));
const prisma = new PrismaClient();

const batchId = process.argv[2];
const projectId = process.argv[3];

const scan = await prisma.docsInventoryScan.findUnique({
  where: { batchId_projectId: { batchId, projectId } },
});
console.log(JSON.stringify(scan, null, 2));
await prisma.$disconnect();
