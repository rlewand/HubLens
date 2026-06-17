export interface ParsedResourceTimes {
  createdAt: Date | null;
  lastModifiedAt: Date | null;
}

export function asString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asBigInt(value: unknown): bigint | null {
  const numberValue = asNumber(value);
  if (numberValue === null) {
    return null;
  }
  return BigInt(Math.trunc(numberValue));
}

export function parseApsDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseResourceTimes(
  attributes: Record<string, unknown> | undefined,
): ParsedResourceTimes {
  return {
    createdAt: parseApsDate(attributes?.createTime),
    lastModifiedAt: parseApsDate(attributes?.lastModifiedTime),
  };
}

export function parseExtensionFromName(displayName: string | null): string | null {
  if (!displayName) {
    return null;
  }
  const dot = displayName.lastIndexOf(".");
  if (dot <= 0 || dot === displayName.length - 1) {
    return null;
  }
  return displayName.slice(dot + 1).toLowerCase();
}

export interface ParsedVersionMeta {
  versionUrn: string;
  displayName: string | null;
  fileType: string | null;
  extension: string | null;
  mimeType: string | null;
  versionNumber: number | null;
  storageSize: bigint | null;
  createdAt: Date | null;
  lastModifiedAt: Date | null;
}

export function parseVersionResource(resource: {
  id: string;
  attributes?: Record<string, unknown>;
}): ParsedVersionMeta {
  const attributes = resource.attributes ?? {};
  const displayName =
    asString(attributes.displayName) ?? asString(attributes.name);
  const extension =
    asString(attributes.extension) ?? parseExtensionFromName(displayName);

  return {
    versionUrn: resource.id,
    displayName,
    fileType: asString(attributes.fileType),
    extension,
    mimeType: asString(attributes.mimeType),
    versionNumber: asNumber(attributes.versionNumber),
    storageSize: asBigInt(attributes.storageSize),
    createdAt: parseApsDate(attributes.createTime),
    lastModifiedAt: parseApsDate(attributes.lastModifiedTime),
  };
}

export interface ParsedFolderMeta {
  folderUrn: string;
  name: string;
  objectCount: number | null;
  hidden: boolean;
  createdAt: Date | null;
  lastModifiedAt: Date | null;
}

export function parseFolderResource(resource: {
  id: string;
  attributes?: Record<string, unknown>;
}): ParsedFolderMeta {
  const attributes = resource.attributes ?? {};
  const name =
    asString(attributes.displayName) ??
    asString(attributes.name) ??
    resource.id;
  const times = parseResourceTimes(attributes);

  return {
    folderUrn: resource.id,
    name,
    objectCount: asNumber(attributes.objectCount),
    hidden: attributes.hidden === true,
    createdAt: times.createdAt,
    lastModifiedAt: times.lastModifiedAt,
  };
}

export interface ParsedItemMeta {
  itemUrn: string;
  displayName: string;
  tipVersionUrn: string | null;
}

export function parseItemResource(resource: {
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { type: string; id: string } | Array<{ type: string; id: string }> }
  >;
}): ParsedItemMeta {
  const attributes = resource.attributes ?? {};
  const displayName =
    asString(attributes.displayName) ??
    asString(attributes.name) ??
    resource.id;

  const tipVersion = resource.relationships?.tipVersion?.data;
  const tipVersionUrn =
    tipVersion && !Array.isArray(tipVersion) ? tipVersion.id : null;

  return {
    itemUrn: resource.id,
    displayName,
    tipVersionUrn,
  };
}

export function buildFormatSummary(
  files: Array<{ extension: string | null; fileType: string | null }>,
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const file of files) {
    const key = file.extension ?? file.fileType ?? "unknown";
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(summary).sort((a, b) => b[1] - a[1]),
  );
}
