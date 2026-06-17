const APS_BASE_URL = "https://developer.api.autodesk.com";

import { apsFetchJson } from "./http";

export type DocsPlatform = "bim360" | "acc";

export interface JsonApiResource {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { type: string; id: string } | Array<{ type: string; id: string }> }
  >;
}

export interface JsonApiPage {
  data: JsonApiResource[];
  links?: {
    next?: { href?: string };
  };
}

export interface DocsContentApiMetrics {
  folders: number;
  files: number;
  versions: number;
  tipVersions: number;
  scannedFolders: number;
  source: "data_management_api";
  formatSummary: Record<string, number>;
  scanMode: "full" | "metrics";
}

export function toHubId(accountId: string): string {
  return accountId.startsWith("b.") ? accountId : `b.${accountId}`;
}

export function toDataManagementProjectId(
  projectId: string,
  platform: DocsPlatform,
): string {
  if (projectId.startsWith("b.") || projectId.startsWith("a.")) {
    return projectId;
  }
  return platform === "acc" ? `b.${projectId}` : `b.${projectId}`;
}

async function apsGet<T>(token: string, url: string): Promise<T> {
  return apsFetchJson<T>(token, url);
}

function getNextPageUrl(page: JsonApiPage): string | null {
  const href = page.links?.next?.href;
  return href && href.length > 0 ? href : null;
}

export async function getTopFolders(
  token: string,
  hubId: string,
  projectId: string,
): Promise<JsonApiResource[]> {
  const url = `${APS_BASE_URL}/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/topFolders`;
  const page = await apsGet<JsonApiPage>(token, url);
  return page.data ?? [];
}

async function listFolderContentsPage(
  token: string,
  projectId: string,
  folderId: string,
  pageNumber: number,
): Promise<JsonApiPage> {
  const url = `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents?page[number]=${pageNumber}`;
  return apsGet<JsonApiPage>(token, url);
}

async function searchFolderPage(
  token: string,
  projectId: string,
  folderId: string,
  pageNumber: number,
): Promise<JsonApiPage> {
  const url = `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/search?page[number]=${pageNumber}`;
  return apsGet<JsonApiPage>(token, url);
}

async function listItemVersionsPage(
  token: string,
  projectId: string,
  itemId: string,
  pageNumber: number,
): Promise<JsonApiPage> {
  const url = `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/versions?page[number]=${pageNumber}`;
  return apsGet<JsonApiPage>(token, url);
}

async function forEachContentsPage(
  token: string,
  projectId: string,
  folderId: string,
  onPage: (resources: JsonApiResource[]) => void,
): Promise<void> {
  let pageNumber = 0;
  const maxPages = 50;

  while (pageNumber < maxPages) {
    const page = await listFolderContentsPage(token, projectId, folderId, pageNumber);
    const resources = page.data ?? [];
    onPage(resources);

    if (!getNextPageUrl(page)) {
      break;
    }
    pageNumber += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function forEachSearchPage(
  token: string,
  projectId: string,
  folderId: string,
  onPage: (resources: JsonApiResource[]) => void,
): Promise<void> {
  let pageNumber = 0;
  const maxPages = 50;

  while (pageNumber < maxPages) {
    const page = await searchFolderPage(token, projectId, folderId, pageNumber);
    const resources = page.data ?? [];
    onPage(resources);

    if (!getNextPageUrl(page)) {
      break;
    }
    pageNumber += 1;
  }
}

async function countAllVersionsForItem(
  token: string,
  projectId: string,
  itemId: string,
): Promise<number> {
  let total = 0;
  let pageNumber = 0;
  const maxPages = 50;

  while (pageNumber < maxPages) {
    const page = await listItemVersionsPage(token, projectId, itemId, pageNumber);
    total += page.data?.length ?? 0;
    if (!getNextPageUrl(page)) {
      break;
    }
    pageNumber += 1;
  }

  return total;
}

function extensionFromDisplayName(displayName: string): string {
  const dot = displayName.lastIndexOf(".");
  if (dot <= 0 || dot === displayName.length - 1) {
    return "unknown";
  }
  return displayName.slice(dot + 1).toLowerCase();
}

function incrementFormatSummary(
  summary: Record<string, number>,
  displayName: string,
): void {
  const key = extensionFromDisplayName(displayName);
  summary[key] = (summary[key] ?? 0) + 1;
}

function getRelatedItemId(version: JsonApiResource): string | null {
  const item = version.relationships?.item?.data;
  if (!item || Array.isArray(item)) {
    return null;
  }
  return item.id;
}

export interface FetchDocsMetricsOptions {
  accountId: string;
  projectId: string;
  platform: DocsPlatform;
  /** When true, fetches every item's version history (slower, more API calls). */
  includeAllVersions?: boolean;
  /** Cap item-level version lookups for safety on large projects. */
  maxItemsForVersionHistory?: number;
}

/**
 * Counts Docs folders, files, and versions via APS Data Management APIs.
 * - Folders: recursive folder traversal from project top folders
 * - Files: distinct items from folder search (tip versions)
 * - Versions: all item revisions when includeAllVersions=true, else tip version count
 */
export async function fetchDocsMetricsFromApi(
  token: string,
  options: FetchDocsMetricsOptions,
): Promise<DocsContentApiMetrics> {
  const hubId = toHubId(options.accountId);
  const dmProjectId = toDataManagementProjectId(options.projectId, options.platform);
  const topFolders = await getTopFolders(token, hubId, dmProjectId);

  if (topFolders.length === 0) {
    return {
      folders: 0,
      files: 0,
      versions: 0,
      tipVersions: 0,
      scannedFolders: 0,
      source: "data_management_api",
      formatSummary: {},
      scanMode: "metrics",
    };
  }

  let folderCount = 0;
  let scannedFolders = 0;
  const folderQueue = topFolders.map((folder) => folder.id);
  const visitedFolders = new Set<string>();
  const itemIds = new Set<string>();
  let tipVersionCount = 0;
  const formatSummary: Record<string, number> = {};

  while (folderQueue.length > 0) {
    const folderId = folderQueue.shift();
    if (!folderId || visitedFolders.has(folderId)) {
      continue;
    }
    visitedFolders.add(folderId);
    scannedFolders += 1;

    await forEachContentsPage(token, dmProjectId, folderId, (resources) => {
      for (const resource of resources) {
        if (resource.type === "folders") {
          folderCount += 1;
          folderQueue.push(resource.id);
        }
      }
    });
  }

  for (const topFolder of topFolders) {
    await forEachSearchPage(token, dmProjectId, topFolder.id, (resources) => {
      tipVersionCount += resources.length;
      for (const resource of resources) {
        const displayName =
          typeof resource.attributes?.displayName === "string"
            ? resource.attributes.displayName
            : typeof resource.attributes?.name === "string"
              ? resource.attributes.name
              : null;
        if (displayName) {
          incrementFormatSummary(formatSummary, displayName);
        }
        const itemId = getRelatedItemId(resource);
        if (itemId) {
          itemIds.add(itemId);
        }
      }
    });
  }

  const files = itemIds.size;
  let versions = tipVersionCount;

  if (options.includeAllVersions && files > 0) {
    const cap = options.maxItemsForVersionHistory ?? 500;
    const itemList = Array.from(itemIds).slice(0, cap);
    let allVersions = 0;

    for (const itemId of itemList) {
      allVersions += await countAllVersionsForItem(token, dmProjectId, itemId);
    }

    versions = allVersions;
  }

  return {
    folders: folderCount,
    files,
    versions,
    tipVersions: tipVersionCount,
    scannedFolders,
    source: "data_management_api",
    formatSummary,
    scanMode: "metrics",
  };
}
