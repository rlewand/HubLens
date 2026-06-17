import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { METADATA_FILENAME } from "@hublens/acc-schema";

const MAX_SEARCH_DEPTH = 8;
const REQUIRED_EXPORT_FILES = ["admin_projects.csv", "metadata.csv"] as const;

async function countCsvFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
      count += 1;
    }
  }
  return count;
}

async function directoryHasFiles(dir: string, filenames: readonly string[]): Promise<boolean> {
  const entries = await readdir(dir);
  const normalized = new Set(entries.map((name) => name.toLowerCase()));
  return filenames.every((filename) => normalized.has(filename.toLowerCase()));
}

async function findDirectoryWithFiles(
  dir: string,
  filenames: readonly string[],
  depth: number,
): Promise<string | null> {
  if (depth > MAX_SEARCH_DEPTH) {
    return null;
  }

  if (await directoryHasFiles(dir, filenames)) {
    return dir;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = await findDirectoryWithFiles(path.join(dir, entry.name), filenames, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

async function findDirWithMetadata(dir: string, depth: number): Promise<string | null> {
  if (depth > MAX_SEARCH_DEPTH) {
    return null;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const hasMetadata = entries.some(
    (entry) => entry.isFile() && entry.name.toLowerCase() === METADATA_FILENAME,
  );
  if (hasMetadata) {
    return dir;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = await findDirWithMetadata(path.join(dir, entry.name), depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

async function findDirWithMostCsvs(dir: string, depth: number): Promise<string> {
  let bestDir = dir;
  let bestCount = await countCsvFiles(dir);

  if (depth >= MAX_SEARCH_DEPTH) {
    return bestDir;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nestedDir = path.join(dir, entry.name);
    const nestedCount = await countCsvFiles(nestedDir);
    if (nestedCount > bestCount) {
      const deeper = await findDirWithMostCsvs(nestedDir, depth + 1);
      const deeperCount = await countCsvFiles(deeper);
      if (deeperCount > bestCount) {
        bestCount = deeperCount;
        bestDir = deeper;
      }
    }
  }

  return bestDir;
}

/** Locate the folder that contains Data Connector CSV exports inside an extracted archive. */
export async function resolveCsvExportRoot(extractDir: string): Promise<string> {
  const exportDir = await findDirectoryWithFiles(extractDir, REQUIRED_EXPORT_FILES, 0);
  if (exportDir) {
    return exportDir;
  }

  const adminProjectsDir = await findDirectoryWithFiles(extractDir, ["admin_projects.csv"], 0);
  if (adminProjectsDir) {
    return adminProjectsDir;
  }

  const metadataDir = await findDirWithMetadata(extractDir, 0);
  if (metadataDir) {
    return metadataDir;
  }

  const csvDir = await findDirWithMostCsvs(extractDir, 0);
  const csvCount = await countCsvFiles(csvDir);
  if (csvCount === 0) {
    throw new Error(
      "No CSV files found in the ZIP archive. Ensure it contains an ACC Data Connector export.",
    );
  }

  return csvDir;
}

export function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip");
}

export async function validateZipFileHeader(filePath: string): Promise<void> {
  const { open } = await import("node:fs/promises");
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4);
    await handle.read(buffer, 0, 4, 0);
    const signature = buffer.toString("binary");
    if (!signature.startsWith("PK")) {
      throw new Error("The selected file is not a valid ZIP archive.");
    }
  } finally {
    await handle.close();
  }
}

/** Stream upload body to disk without buffering the entire file in memory. */
export async function writeUploadStream(source: Readable, destPath: string): Promise<void> {
  const { createWriteStream } = await import("node:fs");
  await pipeline(source, createWriteStream(destPath));
}

/**
 * Extract a ZIP using the system `tar` command (streams from disk, no Node buffer limit).
 * Available on Windows 10+ and Unix.
 */
export async function extractZipWithTar(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("tar", ["-xf", zipPath, "-C", destDir], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ZIP extraction failed (exit code ${code}).`));
    });
  });
}

export async function saveAndExtractZip(source: Readable, zipPath: string, destDir: string): Promise<void> {
  await writeUploadStream(source, zipPath);
  await validateZipFileHeader(zipPath);
  await extractZipWithTar(zipPath, destDir);
}
