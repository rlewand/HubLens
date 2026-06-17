/**
 * Patch module_evidence for one project with live APS Docs metrics (no full re-import).
 *
 * Usage: node scripts/patch-docs-metrics.mjs [projectId]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const { PrismaClient } = require(path.join(
  repoRoot,
  "node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client",
));
const prisma = new PrismaClient();

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, "apps/web/.env.local"));

const APS_BASE_URL = "https://developer.api.autodesk.com";
const projectId =
  process.argv[2] ?? process.env.APS_DOCS_METRICS_PROJECT_IDS?.split(",")[0]?.trim() ??
  "820af33b-9af2-4778-8d34-2c08774c6ccf";

const TABLE_KEYS = {
  folders: "docs_content_folders",
  files: "docs_content_files",
  versions: "docs_content_versions",
};

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function getToken() {
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("APS_CLIENT_ID and APS_CLIENT_SECRET required.");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "data:read account:read",
  });
  const response = await fetch(`${APS_BASE_URL}/authentication/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Token failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

async function apsGet(token, url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`GET failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

function nextHref(page) {
  return page.links?.next?.href ?? null;
}

async function forEachPage(fetchPage, onData) {
  let pageNumber = 0;
  while (pageNumber < 50) {
    const page = await fetchPage(pageNumber);
    onData(page.data ?? []);
    if (!nextHref(page)) break;
    pageNumber += 1;
  }
}

function itemIdFromVersion(version) {
  const item = version.relationships?.item?.data;
  return item && !Array.isArray(item) ? item.id : null;
}

async function countDocsMetrics(token, accountId, dmProjectId) {
  const hubId = `b.${accountId}`;
  const topPage = await apsGet(
    token,
    `${APS_BASE_URL}/project/v1/hubs/${hubId}/projects/${dmProjectId}/topFolders`,
  );
  const topFolders = topPage.data ?? [];

  let folderCount = 0;
  const queue = topFolders.map((f) => f.id);
  const visited = new Set();

  while (queue.length > 0) {
    const folderId = queue.shift();
    if (!folderId || visited.has(folderId)) continue;
    visited.add(folderId);

    await forEachPage(
      (pageNumber) =>
        apsGet(
          token,
          `${APS_BASE_URL}/data/v1/projects/${dmProjectId}/folders/${encodeURIComponent(folderId)}/contents?page[number]=${pageNumber}`,
        ),
      (resources) => {
        for (const resource of resources) {
          if (resource.type === "folders") {
            folderCount += 1;
            queue.push(resource.id);
          }
        }
      },
    );
  }

  const itemIds = new Set();
  let tipVersions = 0;
  for (const topFolder of topFolders) {
    await forEachPage(
      (pageNumber) =>
        apsGet(
          token,
          `${APS_BASE_URL}/data/v1/projects/${dmProjectId}/folders/${encodeURIComponent(topFolder.id)}/search?page[number]=${pageNumber}`,
        ),
      (resources) => {
        tipVersions += resources.length;
        for (const resource of resources) {
          const itemId = itemIdFromVersion(resource);
          if (itemId) itemIds.add(itemId);
        }
      },
    );
  }

  return { folders: folderCount, files: itemIds.size, versions: tipVersions };
}

try {
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    orderBy: { batch: { createdAt: "desc" } },
    include: { batch: true },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found in database. Run an import first.`);
  }

  console.log(`Patching batch ${project.batchId} — ${project.name}`);
  const token = await getToken();
  const dmProjectId = `b.${project.id}`;
  const metrics = await countDocsMetrics(token, project.accountId, dmProjectId);
  console.log("Live metrics:", metrics);

  for (const [key, tableKey] of Object.entries(TABLE_KEYS)) {
    const recordCount = metrics[key];
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
} finally {
  await prisma.$disconnect();
}
