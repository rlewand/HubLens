/** ACC Data Connector CSV naming: `{module}_{table}.csv` */
export const CSV_FILENAME_PATTERN = /^([a-z0-9]+)_(.+)\.csv$/i;

export const METADATA_FILENAME = "metadata.csv";

/**
 * Platform-specific Data Connector table pairs.
 * See Data Connector `schemas/issues.json` vs `schemas/issuesbim360.json`.
 */
export const PLATFORM_EVIDENCE_PAIRS: Record<
  string,
  { acc: string; bim360: string; projectColumn?: string }
> = {
  issues: {
    acc: "issues_issues",
    bim360: "issuesbim360_issues",
    projectColumn: "bim360_project_id",
  },
  issues_comments: {
    acc: "issues_comments",
    bim360: "issuesbim360_comments",
    projectColumn: "bim360_project_id",
  },
  issues_attachments: {
    acc: "issues_attachments",
    bim360: "issuesbim360_attachments",
    projectColumn: "bim360_project_id",
  },
};

/** Priority admin tables for Phase 1 ingest */
export const PRIORITY_ADMIN_TABLES = [
  "admin_accounts",
  "admin_users",
  "admin_projects",
  "admin_account_services",
  "admin_project_services",
  "admin_project_products",
  "admin_project_users",
  "admin_companies",
  "admin_business_units",
] as const;

/** Maps CSV basename (without .csv) to project ID column */
export const PROJECT_ID_COLUMNS: Record<string, string> = {
  default: "bim360_project_id",
  admin_projects: "id",
  admin_project_services: "project_id",
  admin_project_products: "bim360_project_id",
  admin_project_users: "bim360_project_id",
};

/** Maps CSV basename to created-at column for activity dating */
export const ACTIVITY_COLUMNS: Record<string, string> = {
  default: "created_at",
  admin_projects: "updated_at",
};

/** Maps CSV basename to user column for distinct user counts */
export const USER_COLUMNS: Record<string, string> = {
  default: "created_by",
  rfis_rfis: "created_by",
  issues_issues: "created_by",
  issuesbim360_issues: "created_by",
  submittalsacc_items: "created_by",
};

export function parseCsvBasename(filename: string): { module: string; table: string } | null {
  const match = filename.match(CSV_FILENAME_PATTERN);
  if (!match) {
    return null;
  }
  return { module: match[1].toLowerCase(), table: match[2].toLowerCase() };
}

export function getProjectIdColumn(basename: string): string {
  return PROJECT_ID_COLUMNS[basename] ?? PROJECT_ID_COLUMNS.default;
}

export function getActivityColumn(basename: string): string {
  return ACTIVITY_COLUMNS[basename] ?? ACTIVITY_COLUMNS.default;
}

export function getUserColumn(basename: string): string {
  return USER_COLUMNS[basename] ?? USER_COLUMNS.default;
}
