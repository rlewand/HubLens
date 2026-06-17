/**
 * Metrics-only docs scan (counts + file types, no per-file DB rows).
 * Usage: node scripts/scan-metrics-only.mjs [projectId]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { getApsToken, loadEnvFile } from "./lib/docs-scan.mjs";

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

const projectId = process.argv[2]?.trim() ?? "2f652adb-4e6f-41e7-9a10-ff940f88f7c0";

const project = await prisma.project.findFirst({
  where: { id: projectId },
  orderBy: { batch: { createdAt: "desc" } },
});

if (!project) {
  throw new Error(`Project ${projectId} not found.`);
}

console.log(`Metrics scan: ${project.name} (${project.id}) in batch ${project.batchId}`);

// Dynamic import compiled TS is awkward; call local API if server is up.
const baseUrl = process.env.HUBLENS_URL ?? "http://localhost:3000";

try {
  const mock = await fetch(`${baseUrl}/api/auth/mock`, { method: "POST" });
  if (!mock.ok) {
    throw new Error(`Mock auth failed (${mock.status})`);
  }
  const cookie = mock.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    throw new Error("No session cookie from mock auth");
  }

  const response = await fetch(`${baseUrl}/api/docs-scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      batchId: project.batchId,
      projectIds: [project.id],
      mode: "metrics",
    }),
  });

  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.warn("API scan unavailable, ensure dev server is running:", error.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
