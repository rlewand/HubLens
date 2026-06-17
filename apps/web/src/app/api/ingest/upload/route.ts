import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma, ImportStatus } from "@hublens/db";
import { getActiveImportBatch, recoverImportBatches } from "@/lib/ingest/batch-recovery";
import { runIngest } from "@/lib/ingest/importer";
import {
  isZipFile,
  resolveCsvExportRoot,
  saveAndExtractZip,
} from "@/lib/ingest/zip";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await recoverImportBatches(session.id);

  const activeImport = await getActiveImportBatch(session.id);
  if (activeImport) {
    return NextResponse.json(
      {
        error: "An import is already running. Wait for it to finish or try again in a few minutes.",
        batchId: activeImport.id,
        status: activeImport.status,
      },
      { status: 409 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload failed. The file may exceed the server size limit." },
      { status: 413 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Please select a ZIP file to import." }, { status: 400 });
  }

  if (!isZipFile(file)) {
    return NextResponse.json(
      { error: "Only .zip archives are supported." },
      { status: 400 },
    );
  }

  const maxMb = Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? "2048", 10);
  if (file.size > maxMb * 1024 * 1024) {
    return NextResponse.json(
      { error: `File exceeds the ${maxMb} MB upload limit.` },
      { status: 413 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The selected ZIP file is empty." }, { status: 400 });
  }

  const uploadRoot = path.join(process.cwd(), ".uploads", session.id, `${Date.now()}`);
  const zipPath = path.join(uploadRoot, "export.zip");
  const extractDir = path.join(uploadRoot, "extracted");

  let batchId: string | null = null;

  try {
    await mkdir(uploadRoot, { recursive: true });

    const webStream = file.stream();
    await saveAndExtractZip(
      Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]),
      zipPath,
      extractDir,
    );

    const csvRoot = await resolveCsvExportRoot(extractDir);

    const batch = await prisma.importBatch.create({
      data: {
        userId: session.id,
        status: ImportStatus.processing,
        fileCount: 0,
      },
    });
    batchId = batch.id;

    void runIngest(session.id, csvRoot, undefined, { existingBatchId: batch.id }).catch(
      (error: unknown) => {
        console.error("[ingest] background import failed:", error);
      },
    );

    return NextResponse.json({
      batchId: batch.id,
      status: "processing",
      ok: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload ingest failed";
    if (batchId) {
      await prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: ImportStatus.failed,
          errorMessage: message,
          completedAt: new Date(),
        },
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
