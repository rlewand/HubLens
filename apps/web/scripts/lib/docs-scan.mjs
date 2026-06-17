import { existsSync, readFileSync } from "node:fs";

const APS_BASE_URL = "https://developer.api.autodesk.com";

export function loadEnvFile(filePath) {
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

export async function getApsToken() {
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

async function apsGet(token, url, attempt = 0) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 429 && attempt < 10) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(120000, 10000 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return apsGet(token, url, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`GET failed (${response.status}): ${await response.text()}`);
  }
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.APS_REQUEST_DELAY_MS ?? 350)));
  return response.json();
}

function nextHref(page) {
  return page.links?.next?.href ?? null;
}

async function forEachPage(fetchPage, onPage) {
  let pageNumber = 0;
  while (pageNumber < 50) {
    const page = await fetchPage(pageNumber);
    onPage(page);
    if (!nextHref(page)) break;
    pageNumber += 1;
  }
}

function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDate(value) {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extensionFromName(name) {
  if (!name) return null;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

function parseVersion(resource) {
  const attrs = resource.attributes ?? {};
  const displayName = asString(attrs.displayName) ?? asString(attrs.name);
  return {
    versionUrn: resource.id,
    displayName,
    fileType: asString(attrs.fileType),
    extension: asString(attrs.extension) ?? extensionFromName(displayName),
    mimeType: asString(attrs.mimeType),
    versionNumber: asNumber(attrs.versionNumber),
    storageSize: asNumber(attrs.storageSize),
    createdAt: parseDate(attrs.createTime),
    lastModifiedAt: parseDate(attrs.lastModifiedTime),
  };
}

function parseFolder(resource) {
  const attrs = resource.attributes ?? {};
  return {
    folderUrn: resource.id,
    name: asString(attrs.displayName) ?? asString(attrs.name) ?? resource.id,
    objectCount: asNumber(attrs.objectCount),
    hidden: attrs.hidden === true,
    createdAt: parseDate(attrs.createTime),
    lastModifiedAt: parseDate(attrs.lastModifiedTime),
  };
}

function parseItem(resource) {
  const attrs = resource.attributes ?? {};
  const tip = resource.relationships?.tipVersion?.data;
  return {
    itemUrn: resource.id,
    displayName: asString(attrs.displayName) ?? asString(attrs.name) ?? resource.id,
    tipVersionUrn: tip && !Array.isArray(tip) ? tip.id : null,
  };
}

function buildFormatSummary(files) {
  const summary = {};
  for (const file of files) {
    const key = file.extension ?? file.fileType ?? "unknown";
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(summary).sort((a, b) => b[1] - a[1]));
}

async function listItemVersions(token, projectId, itemUrn) {
  const versions = [];
  let pageNumber = 0;
  while (pageNumber < 50) {
    const page = await apsGet(
      token,
      `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemUrn)}/versions?page[number]=${pageNumber}`,
    );
    versions.push(...(page.data ?? []));
    if (!nextHref(page)) break;
    pageNumber += 1;
  }
  return versions;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export async function scanProjectDocs(token, accountId, projectId, options = {}) {
  const hubId = `b.${accountId}`;
  const dmProjectId = `b.${projectId}`;
  const concurrency = options.concurrency ?? 4;
  const maxItems = options.maxItems ?? 10_000;
  const includeAllVersions = options.includeAllVersions === true;

  const topPage = await apsGet(
    token,
    `${APS_BASE_URL}/project/v1/hubs/${hubId}/projects/${dmProjectId}/topFolders`,
  );
  const topFolders = topPage.data ?? [];

  const folders = topFolders.map((folder) => {
    const parsed = parseFolder(folder);
    return {
      ...parsed,
      parentFolderUrn: null,
      isTopFolder: true,
    };
  });

  const itemRefs = new Map();
  const queue = topFolders.map((folder) => folder.id);
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
      (page) => {
        for (const resource of page.data ?? []) {
          if (resource.type === "folders") {
            const parsed = parseFolder(resource);
            folders.push({
              ...parsed,
              parentFolderUrn: folderId,
              isTopFolder: false,
            });
            queue.push(resource.id);
          } else if (resource.type === "items") {
            const parsed = parseItem(resource);
            itemRefs.set(parsed.itemUrn, {
              ...parsed,
              folderUrn: folderId,
            });
          }
        }
      },
    );
  }

  const itemList = [...itemRefs.values()].slice(0, maxItems);
  const files = await mapWithConcurrency(itemList, concurrency, async (item) => {
    let versionResources = [];
    if (includeAllVersions) {
      versionResources = await listItemVersions(token, dmProjectId, item.itemUrn);
    }

    const versions = versionResources.map((resource) => ({
      ...parseVersion(resource),
      isTip: item.tipVersionUrn === resource.id,
    }));

    if (versions.length === 0 && item.tipVersionUrn) {
      versions.push({
        versionUrn: item.tipVersionUrn,
        displayName: item.displayName,
        fileType: null,
        extension: extensionFromName(item.displayName),
        mimeType: null,
        versionNumber: 1,
        storageSize: null,
        createdAt: null,
        lastModifiedAt: null,
        isTip: true,
      });
    }

    if (versions.length > 0 && !versions.some((version) => version.isTip)) {
      versions[versions.length - 1].isTip = true;
    }

    const tip = versions.find((version) => version.isTip) ?? versions[versions.length - 1] ?? null;
    return {
      itemUrn: item.itemUrn,
      folderUrn: item.folderUrn,
      displayName: tip?.displayName ?? item.displayName,
      fileType: tip?.fileType ?? null,
      extension: tip?.extension ?? null,
      mimeType: tip?.mimeType ?? null,
      versionCount: versions.length,
      tipVersionNumber: tip?.versionNumber ?? null,
      tipVersionUrn: tip?.versionUrn ?? item.tipVersionUrn,
      storageSize: tip?.storageSize ?? null,
      createdAt: tip?.createdAt ?? null,
      lastModifiedAt: tip?.lastModifiedAt ?? null,
      versions,
    };
  });

  const versionCount = files.reduce((sum, file) => sum + file.versionCount, 0);
  return {
    folders,
    files,
    folderCount: folders.length,
    fileCount: files.length,
    versionCount,
    formatSummary: buildFormatSummary(files),
  };
}

const BATCH = 250;

export async function persistInventory(prisma, batchId, projectId, inventory) {
  await prisma.$transaction(async (tx) => {
    await tx.docsFileVersion.deleteMany({ where: { batchId, projectId } });
    await tx.docsFile.deleteMany({ where: { batchId, projectId } });
    await tx.docsFolder.deleteMany({ where: { batchId, projectId } });

    await tx.docsInventoryScan.upsert({
      where: { batchId_projectId: { batchId, projectId } },
      create: {
        batchId,
        projectId,
        status: "completed",
        folderCount: inventory.folderCount,
        fileCount: inventory.fileCount,
        versionCount: inventory.versionCount,
        formatSummary: inventory.formatSummary,
        scannedAt: new Date(),
      },
      update: {
        status: "completed",
        folderCount: inventory.folderCount,
        fileCount: inventory.fileCount,
        versionCount: inventory.versionCount,
        formatSummary: inventory.formatSummary,
        scannedAt: new Date(),
        errorMessage: null,
      },
    });

    for (let i = 0; i < inventory.folders.length; i += BATCH) {
      await tx.docsFolder.createMany({
        data: inventory.folders.slice(i, i + BATCH).map((folder) => ({
          batchId,
          projectId,
          folderUrn: folder.folderUrn,
          parentFolderUrn: folder.parentFolderUrn,
          name: folder.name,
          isTopFolder: folder.isTopFolder,
          objectCount: folder.objectCount,
          hidden: folder.hidden,
          createdAt: folder.createdAt,
          lastModifiedAt: folder.lastModifiedAt,
        })),
      });
    }

    for (let i = 0; i < inventory.files.length; i += BATCH) {
      await tx.docsFile.createMany({
        data: inventory.files.slice(i, i + BATCH).map((file) => ({
          batchId,
          projectId,
          itemUrn: file.itemUrn,
          folderUrn: file.folderUrn,
          displayName: file.displayName,
          fileType: file.fileType,
          extension: file.extension,
          mimeType: file.mimeType,
          versionCount: file.versionCount,
          tipVersionNumber: file.tipVersionNumber,
          tipVersionUrn: file.tipVersionUrn,
          storageSize: file.storageSize != null ? BigInt(Math.trunc(file.storageSize)) : null,
          createdAt: file.createdAt,
          lastModifiedAt: file.lastModifiedAt,
        })),
      });
    }

    const versionRows = inventory.files.flatMap((file) =>
      file.versions.map((version) => ({
        batchId,
        projectId,
        itemUrn: file.itemUrn,
        versionUrn: version.versionUrn,
        versionNumber: version.versionNumber,
        displayName: version.displayName,
        fileType: version.fileType,
        extension: version.extension,
        mimeType: version.mimeType,
        storageSize:
          version.storageSize != null ? BigInt(Math.trunc(version.storageSize)) : null,
        isTip: version.isTip,
        createdAt: version.createdAt,
        lastModifiedAt: version.lastModifiedAt,
      })),
    );

    for (let i = 0; i < versionRows.length; i += BATCH) {
      await tx.docsFileVersion.createMany({ data: versionRows.slice(i, i + BATCH) });
    }

    for (const [tableKey, recordCount] of [
      ["docs_content_folders", inventory.folderCount],
      ["docs_content_files", inventory.fileCount],
      ["docs_content_versions", inventory.versionCount],
    ]) {
      if (recordCount <= 0) continue;
      await tx.moduleEvidence.upsert({
        where: {
          batchId_projectId_moduleKey_tableKey: {
            batchId,
            projectId,
            moduleKey: "docs",
            tableKey,
          },
        },
        create: {
          batchId,
          projectId,
          moduleKey: "docs",
          tableKey,
          recordCount,
          distinctUsers: 0,
        },
        update: { recordCount },
      });
    }
  });
}
