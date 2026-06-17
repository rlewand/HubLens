import {
  getTopFolders,
  toDataManagementProjectId,
  toHubId,
  type DocsPlatform,
  type JsonApiResource,
} from "./data-management";
import { apsFetchJson } from "./http";
import {
  buildFormatSummary,
  parseFolderResource,
  parseItemResource,
  parseVersionResource,
  type ParsedVersionMeta,
} from "./parsers";

const APS_BASE_URL = "https://developer.api.autodesk.com";

export interface ScannedDocsFolder {
  folderUrn: string;
  parentFolderUrn: string | null;
  name: string;
  isTopFolder: boolean;
  objectCount: number | null;
  hidden: boolean;
  createdAt: Date | null;
  lastModifiedAt: Date | null;
}

export interface ScannedDocsFileVersion extends ParsedVersionMeta {
  isTip: boolean;
}

export interface ScannedDocsFile {
  itemUrn: string;
  folderUrn: string | null;
  displayName: string;
  fileType: string | null;
  extension: string | null;
  mimeType: string | null;
  versionCount: number;
  tipVersionNumber: number | null;
  tipVersionUrn: string | null;
  storageSize: bigint | null;
  createdAt: Date | null;
  lastModifiedAt: Date | null;
  versions: ScannedDocsFileVersion[];
}

export interface ProjectDocsInventory {
  folders: ScannedDocsFolder[];
  files: ScannedDocsFile[];
  folderCount: number;
  fileCount: number;
  versionCount: number;
  formatSummary: Record<string, number>;
}

interface ItemRef {
  itemUrn: string;
  folderUrn: string;
  displayName: string;
  tipVersionUrn: string | null;
}

export interface ScanProjectDocsOptions {
  accountId: string;
  projectId: string;
  platform: DocsPlatform;
  includeAllVersions?: boolean;
  maxItems?: number;
  versionFetchConcurrency?: number;
  onProgress?: (message: string) => void;
}

interface JsonApiPage {
  data?: JsonApiResource[];
  included?: JsonApiResource[];
  links?: { next?: { href?: string } };
}

async function apsGet(token: string, url: string): Promise<JsonApiPage> {
  return apsFetchJson<JsonApiPage>(token, url);
}

function nextPageUrl(page: JsonApiPage): string | null {
  const href = page.links?.next?.href;
  return href && href.length > 0 ? href : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function forEachContentsPage(
  token: string,
  projectId: string,
  folderId: string,
  onPage: (page: JsonApiPage) => void,
): Promise<void> {
  let pageNumber = 0;
  while (pageNumber < 50) {
    const url = `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents?page[number]=${pageNumber}`;
    const page = await apsGet(token, url);
    onPage(page);
    if (!nextPageUrl(page)) {
      break;
    }
    pageNumber += 1;
    await sleep(150);
  }
}

async function listItemVersions(
  token: string,
  projectId: string,
  itemUrn: string,
): Promise<JsonApiResource[]> {
  const versions: JsonApiResource[] = [];
  let pageNumber = 0;
  while (pageNumber < 50) {
    const url = `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemUrn)}/versions?page[number]=${pageNumber}`;
    const page = await apsGet(token, url);
    versions.push(...(page.data ?? []));
    if (!nextPageUrl(page)) {
      break;
    }
    pageNumber += 1;
  }
  return versions;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function scanProjectDocsInventory(
  token: string,
  options: ScanProjectDocsOptions,
): Promise<ProjectDocsInventory> {
  const hubId = toHubId(options.accountId);
  const dmProjectId = toDataManagementProjectId(
    options.projectId,
    options.platform,
  );
  const includeAllVersions = options.includeAllVersions === true;
  const maxItems = options.maxItems ?? 10_000;
  const concurrency = options.versionFetchConcurrency ?? 2;

  options.onProgress?.("Loading top folders…");
  const topFolders = await getTopFolders(token, hubId, dmProjectId);

  const folders: ScannedDocsFolder[] = topFolders.map((folder) => {
    const parsed = parseFolderResource(folder);
    return {
      folderUrn: parsed.folderUrn,
      parentFolderUrn: null,
      name: parsed.name,
      isTopFolder: true,
      objectCount: parsed.objectCount,
      hidden: parsed.hidden,
      createdAt: parsed.createdAt,
      lastModifiedAt: parsed.lastModifiedAt,
    };
  });

  const itemRefs = new Map<string, ItemRef>();
  const folderQueue = topFolders.map((folder) => folder.id);
  const visitedFolders = new Set<string>();

  options.onProgress?.("Scanning folder tree…");
  while (folderQueue.length > 0) {
    const folderId = folderQueue.shift();
    if (!folderId || visitedFolders.has(folderId)) {
      continue;
    }
    visitedFolders.add(folderId);

    await forEachContentsPage(token, dmProjectId, folderId, (page) => {
      const includedById = new Map(
        (page.included ?? []).map((resource) => [resource.id, resource]),
      );

      for (const resource of page.data ?? []) {
        if (resource.type === "folders") {
          const parsed = parseFolderResource(resource);
          folders.push({
            folderUrn: parsed.folderUrn,
            parentFolderUrn: folderId,
            name: parsed.name,
            isTopFolder: false,
            objectCount: parsed.objectCount,
            hidden: parsed.hidden,
            createdAt: parsed.createdAt,
            lastModifiedAt: parsed.lastModifiedAt,
          });
          folderQueue.push(resource.id);
          continue;
        }

        if (resource.type === "items") {
          const parsed = parseItemResource(resource);
          let tipVersionUrn = parsed.tipVersionUrn;
          if (!tipVersionUrn) {
            const tipRel = resource.relationships?.tipVersion?.data;
            if (tipRel && !Array.isArray(tipRel)) {
              tipVersionUrn = tipRel.id;
            }
          }

          itemRefs.set(parsed.itemUrn, {
            itemUrn: parsed.itemUrn,
            folderUrn: folderId,
            displayName: parsed.displayName,
            tipVersionUrn,
          });

          if (tipVersionUrn && includedById.has(tipVersionUrn)) {
            includedById.get(tipVersionUrn);
          }
        }
      }
    });
  }

  const itemList = Array.from(itemRefs.values()).slice(0, maxItems);
  options.onProgress?.(`Fetching versions for ${itemList.length} files…`);

  const files = await mapWithConcurrency(itemList, concurrency, async (item) => {
    let versionResources: JsonApiResource[] = [];
    if (includeAllVersions) {
      versionResources = await listItemVersions(token, dmProjectId, item.itemUrn);
    }

    const versions: ScannedDocsFileVersion[] = versionResources.map((resource) => {
      const parsed = parseVersionResource(resource);
      return {
        ...parsed,
        isTip: item.tipVersionUrn === resource.id,
      };
    });

    if (versions.length === 0 && item.tipVersionUrn) {
      versions.push({
        versionUrn: item.tipVersionUrn,
        displayName: item.displayName,
        fileType: null,
        extension: null,
        mimeType: null,
        versionNumber: 1,
        storageSize: null,
        createdAt: null,
        lastModifiedAt: null,
        isTip: true,
      });
    }

    if (versions.length > 0 && !versions.some((version) => version.isTip)) {
      const latest = versions.reduce((best, current) => {
        const bestNum = best.versionNumber ?? 0;
        const currentNum = current.versionNumber ?? 0;
        return currentNum >= bestNum ? current : best;
      });
      latest.isTip = true;
    }

    const tipVersion =
      versions.find((version) => version.isTip) ??
      versions[versions.length - 1] ??
      null;

    return {
      itemUrn: item.itemUrn,
      folderUrn: item.folderUrn,
      displayName: tipVersion?.displayName ?? item.displayName,
      fileType: tipVersion?.fileType ?? null,
      extension: tipVersion?.extension ?? null,
      mimeType: tipVersion?.mimeType ?? null,
      versionCount: versions.length,
      tipVersionNumber: tipVersion?.versionNumber ?? null,
      tipVersionUrn: tipVersion?.versionUrn ?? item.tipVersionUrn,
      storageSize: tipVersion?.storageSize ?? null,
      createdAt: tipVersion?.createdAt ?? null,
      lastModifiedAt: tipVersion?.lastModifiedAt ?? null,
      versions,
    } satisfies ScannedDocsFile;
  });

  const versionCount = files.reduce((sum, file) => sum + file.versionCount, 0);
  const formatSummary = buildFormatSummary(files);

  return {
    folders,
    files,
    folderCount: folders.length,
    fileCount: files.length,
    versionCount,
    formatSummary,
  };
}
