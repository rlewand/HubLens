import { prisma } from "@hublens/db";
import {
  apiDocsMetricsToEvidenceRows,
  DOCS_CONTENT_TABLE_KEYS,
} from "@/lib/ingest/docs-content";
import type { DocsContentApiMetrics } from "./data-management";
import type { ProjectDocsInventory } from "./scan-project-inventory";

const BATCH_SIZE = 250;

export async function persistProjectDocsMetricsOnly(
  batchId: string,
  projectId: string,
  metrics: DocsContentApiMetrics,
): Promise<void> {
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
        folderCount: metrics.folders,
        fileCount: metrics.files,
        versionCount: metrics.versions,
        formatSummary: metrics.formatSummary,
        scannedAt: new Date(),
      },
      update: {
        status: "completed",
        folderCount: metrics.folders,
        fileCount: metrics.files,
        versionCount: metrics.versions,
        formatSummary: metrics.formatSummary,
        scannedAt: new Date(),
        errorMessage: null,
      },
    });

    for (const evidenceRow of apiDocsMetricsToEvidenceRows(projectId, {
      folders: metrics.folders,
      files: metrics.files,
      versions: metrics.versions,
    })) {
      await tx.moduleEvidence.upsert({
        where: {
          batchId_projectId_moduleKey_tableKey: {
            batchId,
            projectId,
            moduleKey: "docs",
            tableKey: evidenceRow.tableKey,
          },
        },
        create: {
          batchId,
          projectId,
          moduleKey: "docs",
          tableKey: evidenceRow.tableKey,
          recordCount: evidenceRow.recordCount,
          distinctUsers: 0,
          lastActivityAt: null,
        },
        update: {
          recordCount: evidenceRow.recordCount,
        },
      });
    }
  });
}

export async function persistProjectDocsInventory(
  batchId: string,
  projectId: string,
  inventory: ProjectDocsInventory,
): Promise<void> {
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

    for (let i = 0; i < inventory.folders.length; i += BATCH_SIZE) {
      await tx.docsFolder.createMany({
        data: inventory.folders.slice(i, i + BATCH_SIZE).map((folder) => ({
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

    for (let i = 0; i < inventory.files.length; i += BATCH_SIZE) {
      await tx.docsFile.createMany({
        data: inventory.files.slice(i, i + BATCH_SIZE).map((file) => ({
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
          storageSize: file.storageSize,
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
        storageSize: version.storageSize,
        isTip: version.isTip,
        createdAt: version.createdAt,
        lastModifiedAt: version.lastModifiedAt,
      })),
    );

    for (let i = 0; i < versionRows.length; i += BATCH_SIZE) {
      await tx.docsFileVersion.createMany({
        data: versionRows.slice(i, i + BATCH_SIZE),
      });
    }

    for (const evidenceRow of apiDocsMetricsToEvidenceRows(projectId, {
      folders: inventory.folderCount,
      files: inventory.fileCount,
      versions: inventory.versionCount,
    })) {
      await tx.moduleEvidence.upsert({
        where: {
          batchId_projectId_moduleKey_tableKey: {
            batchId,
            projectId,
            moduleKey: "docs",
            tableKey: evidenceRow.tableKey,
          },
        },
        create: {
          batchId,
          projectId,
          moduleKey: "docs",
          tableKey: evidenceRow.tableKey,
          recordCount: evidenceRow.recordCount,
          distinctUsers: 0,
          lastActivityAt: null,
        },
        update: {
          recordCount: evidenceRow.recordCount,
        },
      });
    }
  });
}

export async function markDocsScanFailed(
  batchId: string,
  projectId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.docsInventoryScan.upsert({
    where: { batchId_projectId: { batchId, projectId } },
    create: {
      batchId,
      projectId,
      status: "failed",
      errorMessage,
    },
    update: {
      status: "failed",
      errorMessage,
      scannedAt: new Date(),
    },
  });
}

export async function markDocsScanStarted(
  batchId: string,
  projectId: string,
): Promise<void> {
  await prisma.docsInventoryScan.upsert({
    where: { batchId_projectId: { batchId, projectId } },
    create: {
      batchId,
      projectId,
      status: "scanning",
    },
    update: {
      status: "scanning",
      errorMessage: null,
    },
  });
}

export { DOCS_CONTENT_TABLE_KEYS };
