/**
 * Test APS Data Management docs metrics for a BIM 360 mid-size project.
 *
 * Usage:
 *   set APS_CLIENT_ID=...
 *   set APS_CLIENT_SECRET=...
 *   node scripts/test-dm-docs-content.mjs
 *
 * Optional env:
 *   APS_ACCOUNT_ID, APS_PROJECT_ID, APS_PROJECT_NAME, APS_INCLUDE_ALL_VERSIONS=true
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, "apps/web/.env.local"));

const APS_BASE_URL = "https://developer.api.autodesk.com";

const testProject = {
  name: process.env.APS_PROJECT_NAME ?? "EF0745 - PAPACKS 2.BA Arnstadt",
  accountId: process.env.APS_ACCOUNT_ID ?? "46349399-0441-4a3f-8acc-38cb6966884a",
  projectId: process.env.APS_PROJECT_ID ?? "820af33b-9af2-4778-8d34-2c08774c6ccf",
  platform: "bim360",
};

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function getToken() {
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Set APS_CLIENT_ID and APS_CLIENT_SECRET in .env before running this test.");
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

  const payload = await response.json();
  return payload.access_token;
}

async function apsGet(token, url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed (${response.status}): ${await response.text()}`);
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

async function countDocsMetrics(token, accountId, projectId) {
  const hubId = `b.${accountId}`;
  const dmProjectId = `b.${projectId}`;

  const topUrl = `${APS_BASE_URL}/project/v1/hubs/${hubId}/projects/${dmProjectId}/topFolders`;
  const topPage = await apsGet(token, topUrl);
  const topFolders = topPage.data ?? [];

  console.log(`Top folders: ${topFolders.map((f) => f.attributes?.name ?? f.id).join(", ") || "(none)"}`);

  let folderCount = 0;
  let scannedFolders = 0;
  const queue = topFolders.map((f) => f.id);
  const visited = new Set();

  while (queue.length > 0) {
    const folderId = queue.shift();
    if (!folderId || visited.has(folderId)) continue;
    visited.add(folderId);
    scannedFolders += 1;

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

  let allVersions = tipVersions;
  if (process.env.APS_INCLUDE_ALL_VERSIONS === "true" && itemIds.size > 0) {
    allVersions = 0;
    const cap = Number(process.env.APS_MAX_ITEMS_FOR_VERSION_HISTORY ?? "200");
    const items = [...itemIds].slice(0, cap);
    for (const itemId of items) {
      await forEachPage(
        (pageNumber) =>
          apsGet(
            token,
            `${APS_BASE_URL}/data/v1/projects/${dmProjectId}/items/${encodeURIComponent(itemId)}/versions?page[number]=${pageNumber}`,
          ),
        (resources) => {
          allVersions += resources.length;
        },
      );
    }
    if (itemIds.size > cap) {
      console.log(`(Version history capped at ${cap} of ${itemIds.size} files)`);
    }
  }

  return {
    folders: folderCount,
    files: itemIds.size,
    versions: allVersions,
    tipVersions,
    scannedFolders,
  };
}

console.log("APS Data Management docs metrics test");
console.log(`Project: ${testProject.name}`);
console.log(`Account: ${testProject.accountId}`);
console.log(`Project ID: ${testProject.projectId} (DM: b.${testProject.projectId})`);
console.log(`Platform: ${testProject.platform}`);
console.log("");

const started = Date.now();

try {
  const token = await getToken();
  const metrics = await countDocsMetrics(
    token,
    testProject.accountId,
    testProject.projectId,
  );

  console.log("\nResults:");
  console.log(`  Folders:        ${metrics.folders}`);
  console.log(`  Files:          ${metrics.files}`);
  console.log(`  Versions:       ${metrics.versions}`);
  console.log(`  Tip versions:   ${metrics.tipVersions}`);
  console.log(`  Scanned folders:${metrics.scannedFolders}`);
  console.log(`\nCompleted in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (error) {
  console.error("\nTest failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
