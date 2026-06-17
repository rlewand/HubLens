import path from "node:path";
import { readdir } from "node:fs/promises";
import {
  getActivityColumn,
  getProjectIdColumn,
  getUserColumn,
  METADATA_FILENAME,
  parseCsvBasename,
  PRIORITY_ADMIN_TABLES,
} from "@hublens/acc-schema";
import { prisma, ImportStatus } from "@hublens/db";
import {
  aggregateEvidence,
  computeMaturityLevel,
  computeOverallMaturity,
  getAllFeatureEvidenceTables,
  loadFeatureCatalogFromFile,
  loadMaturityRulesFromFile,
  type MaturityRulesConfig,
  type TableEvidence,
} from "@hublens/maturity-engine";
import { getFeatureCatalogPath, getMaturityRulesPath } from "@/lib/auth";
import {
  aggregateDocsContentFromPackages,
  apiDocsMetricsToEvidenceRows,
  docsContentMetricsToEvidenceRows,
} from "./docs-content";
import { enrichDocsMetricsForProjects } from "@/lib/aps/enrich-docs";
import {
  deleteBatchData,
  recoverImportBatches,
} from "@/lib/ingest/batch-recovery";
import {
  forEachCsvRow,
  parseBoolean,
  parseCsvFile,
  parseIntSafe,
  parseTimestamp,
  streamEvidenceFromCsv,
} from "./parser";

export interface IngestSourceFile {
  basename: string;
  absolutePath: string;
  tableKey: string;
}

export interface IngestProgress {
  batchId: string;
  filesProcessed: number;
  totalFiles: number;
}

const ADMIN_FILE_ORDER = [...PRIORITY_ADMIN_TABLES, METADATA_FILENAME];

function sortIngestFiles(files: IngestSourceFile[]): IngestSourceFile[] {
  return [...files].sort((a, b) => {
    const aIndex = ADMIN_FILE_ORDER.indexOf(a.tableKey as (typeof ADMIN_FILE_ORDER)[number]);
    const bIndex = ADMIN_FILE_ORDER.indexOf(b.tableKey as (typeof ADMIN_FILE_ORDER)[number]);
    if (aIndex !== -1 || bIndex !== -1) {
      const aRank = aIndex === -1 ? 999 : aIndex;
      const bRank = bIndex === -1 ? 999 : bIndex;
      return aRank - bRank;
    }
    return a.basename.localeCompare(b.basename);
  });
}

function buildEvidenceWhitelist(
  rules: MaturityRulesConfig,
  featureTables: Set<string>,
): Set<string> {
  const tables = new Set<string>(featureTables);
  for (const module of Object.values(rules.modules)) {
    for (const table of module.evidence_tables) {
      tables.add(table);
    }
  }
  return tables;
}

export async function listCsvFiles(
  inputDir: string,
  evidenceWhitelist: Set<string>,
): Promise<IngestSourceFile[]> {
  const entries = await readdir(inputDir);
  const files: IngestSourceFile[] = [];

  for (const basename of entries) {
    if (!basename.toLowerCase().endsWith(".csv")) {
      continue;
    }

    if (basename === METADATA_FILENAME) {
      files.push({
        basename,
        absolutePath: path.join(inputDir, basename),
        tableKey: METADATA_FILENAME,
      });
      continue;
    }

    const parsedName = parseCsvBasename(basename);
    if (!parsedName) {
      continue;
    }

    const tableKey = `${parsedName.module}_${parsedName.table}`;
    const isAdmin = (PRIORITY_ADMIN_TABLES as readonly string[]).includes(tableKey);
    const isEvidence = evidenceWhitelist.has(tableKey);

    if (isAdmin || isEvidence) {
      files.push({
        basename,
        absolutePath: path.join(inputDir, basename),
        tableKey,
      });
    }
  }

  return sortIngestFiles(files);
}

interface EvidenceAccumulator {
  recordCount: number;
  users: Set<string>;
  lastActivityAt: Date | null;
}

function getOrCreateEvidence(
  map: Map<string, EvidenceAccumulator>,
  key: string,
): EvidenceAccumulator {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created: EvidenceAccumulator = {
    recordCount: 0,
    users: new Set<string>(),
    lastActivityAt: null,
  };
  map.set(key, created);
  return created;
}

function recordEvidenceRow(
  map: Map<string, EvidenceAccumulator>,
  evidenceKey: string,
  userValue: string | undefined,
  activity: Date | null,
): void {
  const acc = getOrCreateEvidence(map, evidenceKey);
  acc.recordCount += 1;
  if (userValue) {
    acc.users.add(userValue);
  }
  if (activity && (!acc.lastActivityAt || activity > acc.lastActivityAt)) {
    acc.lastActivityAt = activity;
  }
}

export interface IngestResult {
  batchId: string;
  projectCount: number;
}

export interface RunIngestOptions {
  /** When set, reuses an import batch created before background ingest starts. */
  existingBatchId?: string;
}

export async function runIngest(
  userId: string,
  inputDir: string,
  onProgress?: (progress: IngestProgress) => void,
  options?: RunIngestOptions,
): Promise<IngestResult> {
  await recoverImportBatches(userId);

  const rules = loadMaturityRulesFromFile(getMaturityRulesPath());
  const featureCatalog = loadFeatureCatalogFromFile(getFeatureCatalogPath());
  const featureTables = getAllFeatureEvidenceTables(featureCatalog);
  const evidenceWhitelist = buildEvidenceWhitelist(rules, featureTables);
  const files = await listCsvFiles(inputDir, evidenceWhitelist);

  let batch: { id: string };
  if (options?.existingBatchId) {
    batch = await prisma.importBatch.update({
      where: { id: options.existingBatchId, userId },
      data: {
        status: ImportStatus.processing,
        fileCount: files.length,
        projectCount: 0,
        errorMessage: null,
        completedAt: null,
      },
    });
  } else {
    batch = await prisma.importBatch.create({
      data: {
        userId,
        status: ImportStatus.processing,
        fileCount: files.length,
      },
    });
  }

  const businessUnits = new Map<string, string>();
  const accountUsers = new Map<string, { name: string | null; email: string | null }>();
  const projectIds = new Set<string>();
  const docsEnabledProjectIds = new Set<string>();
  const evidenceByProjectTable = new Map<string, EvidenceAccumulator>();
  let accountId: string | null = null;
  let accountName: string | null = null;
  let metadataJson: Record<string, string> | null = null;

  try {
    let processed = 0;
    for (const file of files) {
      processed += 1;
      onProgress?.({ batchId: batch.id, filesProcessed: processed, totalFiles: files.length });

      if (file.tableKey === METADATA_FILENAME) {
        const { rows } = await parseCsvFile(file.absolutePath);
        metadataJson = rows[0] ?? null;
        continue;
      }

      if (file.tableKey === "admin_accounts") {
        const { rows } = await parseCsvFile(file.absolutePath);
        if (rows[0]) {
          accountId = rows[0].bim360_account_id ?? accountId;
          accountName = rows[0].display_name ?? accountName;
        }
        continue;
      }

      if (file.tableKey === "admin_business_units") {
        const { rows } = await parseCsvFile(file.absolutePath);
        for (const row of rows) {
          if (row.id && row.name) {
            businessUnits.set(row.id, row.name);
          }
        }
        continue;
      }

      if (file.tableKey === "admin_users") {
        const { rows } = await parseCsvFile(file.absolutePath);
        for (const row of rows) {
          if (row.id) {
            accountUsers.set(row.id, {
              name: row.name ?? null,
              email: row.email ?? null,
            });
          }
        }
        continue;
      }

      if (file.tableKey === "admin_project_users") {
        let adminBatch: Array<{
          batchId: string;
          projectId: string;
          userId: string;
          name: string | null;
          email: string | null;
        }> = [];

        const flushAdminBatch = async (): Promise<void> => {
          if (adminBatch.length === 0) {
            return;
          }
          const chunk = adminBatch;
          adminBatch = [];
          await prisma.projectAdmin.createMany({
            data: chunk,
            skipDuplicates: true,
          });
        };

        await forEachCsvRow(file.absolutePath, async (row) => {
          if (
            !row.bim360_project_id ||
            !row.user_id ||
            row.access_level !== "project_admin" ||
            row.status !== "active" ||
            !projectIds.has(row.bim360_project_id)
          ) {
            return;
          }
          const user = accountUsers.get(row.user_id);
          adminBatch.push({
            batchId: batch.id,
            projectId: row.bim360_project_id,
            userId: row.user_id,
            name: user?.name ?? null,
            email: user?.email ?? null,
          });
          if (adminBatch.length >= 500) {
            await flushAdminBatch();
          }
        });

        await flushAdminBatch();
        continue;
      }

      if (file.tableKey === "admin_projects") {
        let rawRowCount = 0;
        let projectRowCount = 0;
        let firstAccountId: string | null = null;
        let projectBatch: Array<{
          id: string;
          batchId: string;
          accountId: string;
          name: string;
          status: string | null;
          jobNumber: string | null;
          projectType: string | null;
          classification: string | null;
          country: string | null;
          businessUnitId: string | null;
          businessUnitName: string | null;
          accProject: boolean;
          totalMemberSize: number | null;
          totalCompanySize: number | null;
          lastSignIn: Date | null;
          startDate: Date | null;
          endDate: Date | null;
          createdAt: Date | null;
          updatedAt: Date | null;
        }> = [];

        const flushProjectBatch = async (): Promise<void> => {
          if (projectBatch.length === 0) {
            return;
          }
          const chunk = projectBatch;
          projectBatch = [];
          await prisma.project.createMany({
            data: chunk,
            skipDuplicates: true,
          });
          projectRowCount += chunk.length;
        };

        await forEachCsvRow(file.absolutePath, async (row) => {
          rawRowCount += 1;
          if (!row.id || !row.bim360_account_id) {
            return;
          }
          if (!firstAccountId) {
            firstAccountId = row.bim360_account_id;
          }
          projectBatch.push({
            id: row.id,
            batchId: batch.id,
            accountId: row.bim360_account_id,
            name: row.name ?? "Unnamed project",
            status: row.status ?? null,
            jobNumber: row.job_number ?? null,
            projectType: row.type ?? null,
            classification: row.classification ?? null,
            country: row.country ?? null,
            businessUnitId: row.business_unit_id ?? null,
            businessUnitName: row.business_unit_id
              ? (businessUnits.get(row.business_unit_id) ?? null)
              : null,
            accProject: parseBoolean(row.acc_project),
            totalMemberSize: parseIntSafe(row.total_member_size),
            totalCompanySize: parseIntSafe(row.total_company_size),
            lastSignIn: parseTimestamp(row.last_sign_in),
            startDate: parseTimestamp(row.start_date),
            endDate: parseTimestamp(row.end_date),
            createdAt: parseTimestamp(row.created_at),
            updatedAt: parseTimestamp(row.updated_at),
          });
          if (projectBatch.length >= 500) {
            await flushProjectBatch();
          }
        });

        await flushProjectBatch();

        if (projectRowCount === 0) {
          throw new Error(
            `admin_projects.csv was found but contained no usable project rows (${rawRowCount} raw rows).`,
          );
        }

        const loadedProjects = await prisma.project.findMany({
          where: { batchId: batch.id },
          select: { id: true },
        });
        projectIds.clear();
        for (const project of loadedProjects) {
          projectIds.add(project.id);
        }

        if (!accountId && firstAccountId) {
          accountId = firstAccountId;
        }
        continue;
      }

      if (file.tableKey === "admin_project_services") {
        let serviceBatch: Array<{
          batchId: string;
          projectId: string;
          service: string;
          status: string;
          createdAt: Date | null;
        }> = [];

        const flushServiceBatch = async (): Promise<void> => {
          if (serviceBatch.length === 0) {
            return;
          }
          const chunk = serviceBatch;
          serviceBatch = [];
          await prisma.projectService.createMany({
            data: chunk,
            skipDuplicates: true,
          });
        };

        await forEachCsvRow(file.absolutePath, async (row) => {
          if (!row.project_id || !row.service || !projectIds.has(row.project_id)) {
            return;
          }
          const status = row.status ?? "active";
          if (row.service === "documentManagement" && status === "active") {
            docsEnabledProjectIds.add(row.project_id);
          }
          serviceBatch.push({
            batchId: batch.id,
            projectId: row.project_id,
            service: row.service,
            status,
            createdAt: parseTimestamp(row.created_at),
          });
          if (serviceBatch.length >= 500) {
            await flushServiceBatch();
          }
        });

        await flushServiceBatch();
        continue;
      }

      if (file.tableKey === "admin_project_products") {
        let productBatch: Array<{
          batchId: string;
          projectId: string;
          productKey: string;
          status: string;
          createdAt: Date | null;
        }> = [];

        const flushProductBatch = async (): Promise<void> => {
          if (productBatch.length === 0) {
            return;
          }
          const chunk = productBatch;
          productBatch = [];
          await prisma.projectProduct.createMany({
            data: chunk,
            skipDuplicates: true,
          });
        };

        await forEachCsvRow(file.absolutePath, async (row) => {
          if (
            !row.bim360_project_id ||
            !row.product_key ||
            !projectIds.has(row.bim360_project_id)
          ) {
            return;
          }
          productBatch.push({
            batchId: batch.id,
            projectId: row.bim360_project_id,
            productKey: row.product_key,
            status: row.status ?? "active",
            createdAt: parseTimestamp(row.created_at),
          });
          if (productBatch.length >= 500) {
            await flushProductBatch();
          }
        });

        await flushProductBatch();
        continue;
      }

      if (!(PRIORITY_ADMIN_TABLES as readonly string[]).includes(file.tableKey)) {
        const projectColumn = getProjectIdColumn(file.tableKey);
        const activityColumn = getActivityColumn(file.tableKey);
        const userColumn = getUserColumn(file.tableKey);

        await streamEvidenceFromCsv(
          file.absolutePath,
          projectColumn,
          activityColumn,
          userColumn,
          (projectId, userValue, activity) => {
            if (!projectIds.has(projectId)) {
              return;
            }
            recordEvidenceRow(
              evidenceByProjectTable,
              `${projectId}::${file.tableKey}`,
              userValue,
              activity,
            );
          },
        );
      }
    }

    const docsMetrics = await aggregateDocsContentFromPackages(inputDir, projectIds);
    for (const evidenceRow of docsContentMetricsToEvidenceRows(docsMetrics)) {
      const acc = getOrCreateEvidence(
        evidenceByProjectTable,
        `${evidenceRow.projectId}::${evidenceRow.tableKey}`,
      );
      acc.recordCount = evidenceRow.recordCount;
      acc.users = new Set(
        Array.from({ length: evidenceRow.distinctUsers }, (_, index) => `docs-user-${index}`),
      );
      acc.lastActivityAt = evidenceRow.lastActivityAt;
    }

    if (docsEnabledProjectIds.size > 0 && accountId) {
      const projectsForDocs = await prisma.project.findMany({
        where: {
          batchId: batch.id,
          id: { in: Array.from(docsEnabledProjectIds) },
        },
        select: { id: true, accountId: true, accProject: true },
      });

      const targets = projectsForDocs.map((project) => ({
        projectId: project.id,
        accountId: project.accountId,
        platform: project.accProject ? ("acc" as const) : ("bim360" as const),
        batchId: batch.id,
      }));

      const apiMetrics = await enrichDocsMetricsForProjects(targets, docsMetrics);

      for (const [projectId, metrics] of apiMetrics) {
        for (const evidenceRow of apiDocsMetricsToEvidenceRows(projectId, metrics)) {
          const acc = getOrCreateEvidence(
            evidenceByProjectTable,
            `${evidenceRow.projectId}::${evidenceRow.tableKey}`,
          );
          acc.recordCount = evidenceRow.recordCount;
          acc.users = new Set(
            Array.from(
              { length: evidenceRow.distinctUsers },
              (_, index) => `docs-api-user-${index}`,
            ),
          );
          acc.lastActivityAt = evidenceRow.lastActivityAt;
        }
      }
    }

    const moduleEvidenceRows = Array.from(evidenceByProjectTable.entries()).map(
      ([key, acc]) => {
        const [projectId, tableKey] = key.split("::");
        const moduleKey = tableKey.split("_")[0];
        return {
          batchId: batch.id,
          projectId,
          moduleKey,
          tableKey,
          recordCount: acc.recordCount,
          distinctUsers: acc.users.size,
          lastActivityAt: acc.lastActivityAt,
        };
      },
    );

    for (let i = 0; i < moduleEvidenceRows.length; i += 500) {
      await prisma.moduleEvidence.createMany({
        data: moduleEvidenceRows.slice(i, i + 500),
        skipDuplicates: true,
      });
    }

    const projects = await prisma.project.findMany({
      where: { batchId: batch.id },
      select: { id: true },
    });

    if (projects.length === 0) {
      throw new Error(
        "Import completed without any projects. Ensure the ZIP contains a valid admin_projects.csv from the Data Connector export.",
      );
    }

    const allServices = await prisma.projectService.findMany({
      where: { batchId: batch.id, status: "active" },
    });
    const allProducts = await prisma.projectProduct.findMany({
      where: { batchId: batch.id, status: "active" },
    });
    const allEvidence = await prisma.moduleEvidence.findMany({
      where: { batchId: batch.id },
    });

    const servicesByProject = new Map<string, string[]>();
    for (const item of allServices) {
      const list = servicesByProject.get(item.projectId) ?? [];
      list.push(item.service);
      servicesByProject.set(item.projectId, list);
    }

    const productsByProject = new Map<string, string[]>();
    for (const item of allProducts) {
      const list = productsByProject.get(item.projectId) ?? [];
      list.push(item.productKey);
      productsByProject.set(item.projectId, list);
    }

    const evidenceByProject = new Map<string, TableEvidence[]>();
    for (const item of allEvidence) {
      const list = evidenceByProject.get(item.projectId) ?? [];
      list.push({
        tableKey: item.tableKey,
        recordCount: item.recordCount,
        distinctUsers: item.distinctUsers,
        lastActivityAt: item.lastActivityAt,
      });
      evidenceByProject.set(item.projectId, list);
    }

    const maturityRows: Array<{
      batchId: string;
      projectId: string;
      moduleKey: string;
      level: number;
      enabled: boolean;
      metricsJson: object;
    }> = [];

    const projectOverall = new Map<string, { overall: number; lastActivity: Date | null }>();

    for (const project of projects) {
      const enabled = {
        services: servicesByProject.get(project.id) ?? [],
        products: productsByProject.get(project.id) ?? [],
      };
      const tableEvidence = evidenceByProject.get(project.id) ?? [];
      const scores = [];

      for (const [moduleKey, rule] of Object.entries(rules.modules)) {
        const evidence = aggregateEvidence(moduleKey, rule.evidence_tables, tableEvidence);
        const result = computeMaturityLevel(rule, enabled, evidence);
        scores.push(result);

        maturityRows.push({
          batchId: batch.id,
          projectId: project.id,
          moduleKey,
          level: result.level,
          enabled: result.enabled,
          metricsJson: result.metrics,
        });
      }

      const overall = computeOverallMaturity(scores);
      const lastActivity = tableEvidence.reduce<Date | null>((latest, row) => {
        if (!row.lastActivityAt) {
          return latest;
        }
        if (!latest || row.lastActivityAt > latest) {
          return row.lastActivityAt;
        }
        return latest;
      }, null);

      projectOverall.set(project.id, { overall, lastActivity });
    }

    for (let i = 0; i < maturityRows.length; i += 500) {
      await prisma.projectMaturityScore.createMany({
        data: maturityRows.slice(i, i + 500),
        skipDuplicates: true,
      });
    }

    for (const [projectId, values] of projectOverall.entries()) {
      await prisma.project.update({
        where: { batchId_id: { batchId: batch.id, id: projectId } },
        data: {
          overallMaturity: values.overall,
          lastActivityAt: values.lastActivity,
        },
      });
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.completed,
        accountId,
        accountName,
        metadataJson: metadataJson ?? undefined,
        projectCount: projects.length,
        completedAt: new Date(),
      },
    });

    return { batchId: batch.id, projectCount: projects.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingest error";
    await deleteBatchData(batch.id);
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.failed,
        errorMessage: message,
        completedAt: new Date(),
        projectCount: 0,
      },
    });
    throw error;
  }
}
