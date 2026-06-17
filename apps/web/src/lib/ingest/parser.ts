import Papa from "papaparse";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Files larger than this are never loaded fully into memory. */
export const MAX_INLINE_CSV_BYTES = 50 * 1024 * 1024;

export async function getFileSize(filePath: string): Promise<number> {
  const info = await stat(filePath);
  return info.size;
}

export async function parseCsvFile(filePath: string): Promise<ParsedCsv> {
  const size = await getFileSize(filePath);
  if (size > MAX_INLINE_CSV_BYTES) {
    throw new Error(
      `File size (${size}) exceeds inline limit (${MAX_INLINE_CSV_BYTES}). Use streamEvidenceFromCsv instead.`,
    );
  }

  const content = await readFile(filePath, "utf8");
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(`CSV parse error in ${filePath}: ${first.message}`);
  }

  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data };
}

export interface EvidenceRowHandler {
  (projectId: string, userValue: string | undefined, activity: Date | null): void;
}

export async function streamCsvFile(
  filePath: string,
  onRow: (row: Record<string, string>) => void | Promise<void>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    Papa.parse<Record<string, string>>(createReadStream(filePath), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      step: (results, parser) => {
        parser.pause();
        Promise.resolve(onRow(results.data))
          .then(() => {
            parser.resume();
          })
          .catch(reject);
      },
      complete: () => resolve(),
      error: (error) => reject(error),
    });
  });
}

/** Reads CSV rows one at a time, streaming when the file exceeds the inline limit. */
export async function forEachCsvRow(
  filePath: string,
  onRow: (row: Record<string, string>) => void | Promise<void>,
): Promise<void> {
  const size = await getFileSize(filePath);
  if (size > MAX_INLINE_CSV_BYTES) {
    await streamCsvFile(filePath, onRow);
    return;
  }

  const { rows } = await parseCsvFile(filePath);
  for (const row of rows) {
    await onRow(row);
  }
}

export async function streamEvidenceFromCsv(
  filePath: string,
  projectColumn: string,
  activityColumn: string,
  userColumn: string,
  onRow: EvidenceRowHandler,
): Promise<boolean> {
  let hasProjectColumn = false;

  await new Promise<void>((resolve, reject) => {
    Papa.parse<Record<string, string>>(createReadStream(filePath), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      step: (result) => {
        const row = result.data;
        if (!(projectColumn in row)) {
          return;
        }
        hasProjectColumn = true;
        const projectId = row[projectColumn];
        if (!projectId) {
          return;
        }
        onRow(projectId, row[userColumn], parseTimestamp(row[activityColumn]));
      },
      complete: () => resolve(),
      error: (error) => reject(error),
    });
  });

  return hasProjectColumn;
}

export function parseTimestamp(value: string | undefined): Date | null {
  if (!value || value.trim() === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "t" || normalized === "true" || normalized === "1";
}

export function parseIntSafe(value: string | undefined): number | null {
  if (!value || value.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
