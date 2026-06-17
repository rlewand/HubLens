import {
  buildProjectFeatureCounts,
  buildProjectFeatureUsage,
  getFeatureColumnDefinitions,
  loadFeatureCatalogFromFile,
  type MaturityLevel,
  type ProjectFeatureUsage,
} from "@hublens/maturity-engine";
import { prisma } from "@hublens/db";
import { recoverImportBatches } from "@/lib/ingest/batch-recovery";
import { getFeatureCatalogPath } from "@/lib/auth";
import { MODULE_KEYS, type ModuleKey } from "@/lib/constants";
import type { DashboardProjectRow } from "@/lib/dashboard-stats";
import { estimateMigration, buildFeatureCounts, buildFormatCounts } from "@/lib/migration-estimate";
import { formatDate } from "@/lib/utils";

function buildDocsSummary(
  features: Record<string, number>,
  scan: {
    folderCount: number;
    fileCount: number;
    versionCount: number;
    status: string;
    errorMessage: string | null;
    formatSummary: unknown;
  } | null,
): DashboardProjectRow["docs"] {
  if (scan) {
    return {
      folders: scan.status === "completed" ? scan.folderCount : features.docs_folders ?? 0,
      files: scan.status === "completed" ? scan.fileCount : features.docs_files ?? 0,
      versions: scan.status === "completed" ? scan.versionCount : features.docs_versions ?? 0,
      scanned: scan.status === "completed",
      scanStatus: scan.status as DashboardProjectRow["docs"]["scanStatus"],
      scanError: scan.errorMessage,
    };
  }
  return {
    folders: features.docs_folders ?? 0,
    files: features.docs_files ?? 0,
    versions: features.docs_versions ?? 0,
    scanned: false,
    scanStatus: null,
    scanError: null,
  };
}

export async function getLatestBatchForUser(userId: string) {
  return prisma.importBatch.findFirst({
    where: {
      userId,
      status: "completed",
      projectCount: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestImportAttempt(userId: string) {
  await recoverImportBatches(userId);
  return prisma.importBatch.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDashboardData(userId: string) {
  const batch = await getLatestBatchForUser(userId);
  if (!batch) {
    return null;
  }

  const [projects, scores, serviceRows, productRows, evidenceRows, docsScans, adminRows, selections] =
    await Promise.all([
    prisma.project.findMany({
      where: { batchId: batch.id },
      orderBy: { name: "asc" },
    }),
    prisma.projectMaturityScore.findMany({
      where: { batchId: batch.id },
    }),
    prisma.projectService.findMany({
      where: { batchId: batch.id, status: "active" },
      select: { projectId: true, service: true },
    }),
    prisma.projectProduct.findMany({
      where: { batchId: batch.id, status: "active" },
      select: { projectId: true, productKey: true },
    }),
    prisma.moduleEvidence.findMany({
      where: { batchId: batch.id },
      select: { projectId: true, tableKey: true, recordCount: true },
    }),
    prisma.docsInventoryScan.findMany({
      where: { batchId: batch.id },
    }),
    prisma.projectAdmin.groupBy({
      by: ["projectId"],
      where: { batchId: batch.id },
      _count: { _all: true },
    }),
    prisma.projectMigrationSelection.findMany({
      where: { userId, batchId: batch.id },
    }),
  ]);

  const servicesByProject = new Map<string, string[]>();
  for (const row of serviceRows) {
    const list = servicesByProject.get(row.projectId) ?? [];
    list.push(row.service);
    servicesByProject.set(row.projectId, list);
  }

  const productsByProject = new Map<string, string[]>();
  for (const row of productRows) {
    const list = productsByProject.get(row.projectId) ?? [];
    list.push(row.productKey);
    productsByProject.set(row.projectId, list);
  }

  const scoresByProject = new Map<string, Partial<Record<ModuleKey, MaturityLevel>>>();
  for (const score of scores) {
    const projectScores = scoresByProject.get(score.projectId) ?? {};
    if (MODULE_KEYS.includes(score.moduleKey as ModuleKey)) {
      projectScores[score.moduleKey as ModuleKey] = score.level as MaturityLevel;
    }
    scoresByProject.set(score.projectId, projectScores);
  }

  const evidenceByProject = new Map<string, Map<string, number>>();
  for (const row of evidenceRows) {
    const tables = evidenceByProject.get(row.projectId) ?? new Map<string, number>();
    tables.set(row.tableKey, row.recordCount);
    evidenceByProject.set(row.projectId, tables);
  }

  const featureCatalog = loadFeatureCatalogFromFile(getFeatureCatalogPath());
  const featureColumns = getFeatureColumnDefinitions(featureCatalog);

  const docsScanByProject = new Map(docsScans.map((scan) => [scan.projectId, scan]));
  const adminCountByProject = new Map(
    adminRows.map((row) => [row.projectId, row._count._all]),
  );
  const syncByProject = new Map(
    selections.map((row) => [row.projectId, row.syncDocs]),
  );

  const projectRows: DashboardProjectRow[] = projects.map((project) => {
    const features = buildProjectFeatureCounts(
      featureCatalog,
      evidenceByProject.get(project.id) ?? new Map<string, number>(),
    );
    const scan = docsScanByProject.get(project.id) ?? null;
    const docs = buildDocsSummary(features, scan);
    const services = servicesByProject.get(project.id) ?? [];
    const formatCounts = buildFormatCounts(scan?.formatSummary);

    const migration = estimateMigration({
      accProject: project.accProject,
      totalMemberSize: project.totalMemberSize,
      totalCompanySize: project.totalCompanySize,
      folders: docs.folders,
      files: docs.files,
      versions: docs.versions,
      adminCount: adminCountByProject.get(project.id) ?? 0,
      serviceCount: services.length,
      features: buildFeatureCounts(features),
      c4rCount: formatCounts.c4rCount,
      rvtCount: formatCounts.rvtCount,
      dwgCount: formatCounts.dwgCount,
      hasRevitOrCad: formatCounts.hasRevitOrCad,
    });

    return {
      id: project.id,
      name: project.name,
      jobNumber: project.jobNumber,
      status: project.status,
      accProject: project.accProject,
      totalMemberSize: project.totalMemberSize,
      overallMaturity: project.overallMaturity,
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
      lastActivityAt: project.lastActivityAt?.toISOString() ?? null,
      maturity: scoresByProject.get(project.id) ?? {},
      services,
      products: productsByProject.get(project.id) ?? [],
      features,
      docs,
      adminCount: adminCountByProject.get(project.id) ?? 0,
      migration,
      syncDocs: syncByProject.get(project.id) ?? false,
    };
  });

  const metadata = batch.metadataJson as Record<string, string> | null;
  const lastRefresh = formatDate(batch.completedAt ?? batch.createdAt);

  return {
    batch,
    projectRows,
    featureColumns,
    lastRefresh,
    exportDate: metadata?.created_at ? formatDate(metadata.created_at) : null,
  };
}

export async function getProjectDetail(userId: string, projectId: string) {
  const batch = await getLatestBatchForUser(userId);
  if (!batch) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { batchId_id: { batchId: batch.id, id: projectId } },
  });
  if (!project) {
    return null;
  }

  const [scores, services, products, evidence, admins, docsScan, docsFolders, docsFiles] =
    await Promise.all([
    prisma.projectMaturityScore.findMany({
      where: { batchId: batch.id, projectId },
      orderBy: { moduleKey: "asc" },
    }),
    prisma.projectService.findMany({
      where: { batchId: batch.id, projectId },
    }),
    prisma.projectProduct.findMany({
      where: { batchId: batch.id, projectId },
    }),
    prisma.moduleEvidence.findMany({
      where: { batchId: batch.id, projectId },
      orderBy: { recordCount: "desc" },
    }),
    prisma.projectAdmin.findMany({
      where: { batchId: batch.id, projectId },
      orderBy: { name: "asc" },
    }),
    prisma.docsInventoryScan.findUnique({
      where: { batchId_projectId: { batchId: batch.id, projectId } },
    }),
    prisma.docsFolder.findMany({
      where: { batchId: batch.id, projectId },
      orderBy: [{ isTopFolder: "desc" }, { name: "asc" }],
    }),
    prisma.docsFile.findMany({
      where: { batchId: batch.id, projectId },
      orderBy: { displayName: "asc" },
      include: {
        versions: {
          orderBy: { versionNumber: "asc" },
        },
      },
    }),
  ]);

  const activeServices = services
    .filter((service) => service.status === "active")
    .map((service) => service.service);
  const activeProducts = products
    .filter((product) => product.status === "active")
    .map((product) => product.productKey);

  const evidenceByTable = new Map<
    string,
    {
      tableKey: string;
      recordCount: number;
      distinctUsers: number;
      lastActivityAt: Date | null;
    }
  >();
  for (const row of evidence) {
    evidenceByTable.set(row.tableKey, {
      tableKey: row.tableKey,
      recordCount: row.recordCount,
      distinctUsers: row.distinctUsers,
      lastActivityAt: row.lastActivityAt,
    });
  }

  const featureCatalog = loadFeatureCatalogFromFile(getFeatureCatalogPath());
  const features: ProjectFeatureUsage[] = buildProjectFeatureUsage(
    featureCatalog,
    activeServices,
    activeProducts,
    evidenceByTable,
  );

  const folderNameByUrn = new Map(
    docsFolders.map((folder) => [folder.folderUrn, folder.name]),
  );
  const childFolderCounts = new Map<string, number>();
  const fileCountsByFolder = new Map<string, number>();
  for (const folder of docsFolders) {
    if (folder.parentFolderUrn) {
      childFolderCounts.set(
        folder.parentFolderUrn,
        (childFolderCounts.get(folder.parentFolderUrn) ?? 0) + 1,
      );
    }
  }
  for (const file of docsFiles) {
    if (file.folderUrn) {
      fileCountsByFolder.set(
        file.folderUrn,
        (fileCountsByFolder.get(file.folderUrn) ?? 0) + 1,
      );
    }
  }

  const docsInventory = docsScan
    ? {
        summary: {
          status: docsScan.status,
          folderCount: docsScan.folderCount,
          fileCount: docsScan.fileCount,
          versionCount: docsScan.versionCount,
          formatSummary:
            (docsScan.formatSummary as Record<string, number> | null) ?? {},
          scannedAt: docsScan.scannedAt?.toISOString() ?? null,
          errorMessage: docsScan.errorMessage,
        },
        folders: docsFolders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          isTopFolder: folder.isTopFolder,
          objectCount: folder.objectCount,
          hidden: folder.hidden,
          childFolderCount: childFolderCounts.get(folder.folderUrn) ?? 0,
          fileCount: fileCountsByFolder.get(folder.folderUrn) ?? 0,
        })),
        files: docsFiles.map((file) => ({
          id: file.id,
          displayName: file.displayName,
          extension: file.extension,
          fileType: file.fileType,
          mimeType: file.mimeType,
          versionCount: file.versionCount,
          tipVersionNumber: file.tipVersionNumber,
          storageSize: file.storageSize?.toString() ?? null,
          folderName: file.folderUrn
            ? (folderNameByUrn.get(file.folderUrn) ?? null)
            : null,
          lastModifiedAt: file.lastModifiedAt?.toISOString() ?? null,
          versions: file.versions.map((version) => ({
            id: version.id,
            versionNumber: version.versionNumber,
            displayName: version.displayName,
            extension: version.extension,
            fileType: version.fileType,
            mimeType: version.mimeType,
            storageSize: version.storageSize?.toString() ?? null,
            isTip: version.isTip,
            createdAt: version.createdAt?.toISOString() ?? null,
            lastModifiedAt: version.lastModifiedAt?.toISOString() ?? null,
          })),
        })),
      }
    : null;

  return {
    batch,
    project,
    scores,
    services,
    products,
    evidence,
    admins,
    features,
    docsInventory,
  };
}
