import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSV_FILENAME_PATTERN = /^([a-z0-9]+)_(.+)\.csv$/i;
const METADATA_FILENAME = "metadata.csv";
const PRIORITY_ADMIN_TABLES = [
  "admin_accounts",
  "admin_projects",
  "admin_account_services",
  "admin_project_services",
  "admin_project_products",
  "admin_project_users",
  "admin_companies",
  "admin_business_units",
];

const evidenceWhitelist = new Set([
  "sheets_sheets",
  "transmittals_workflow_transmittals",
  "rfis_rfis",
  "issues_issues",
  "submittalsacc_items",
  "cost_budgets",
  "cost_change_orders",
  "clashes_assigned_clash_group",
  "clashes_clash_test",
  "forms_forms",
  "dailylogs_daily_logs",
  "checklists_checklists",
  "takeoff_takeoff_items",
  "takeoff_packages",
  "assets_assets",
]);

async function listCsvFiles(inputDir) {
  const entries = await readdir(inputDir);
  const files = [];
  for (const basename of entries) {
    if (!basename.toLowerCase().endsWith(".csv")) continue;
    if (basename === METADATA_FILENAME) {
      files.push(basename);
      continue;
    }
    const match = basename.match(CSV_FILENAME_PATTERN);
    if (!match) continue;
    const tableKey = `${match[1].toLowerCase()}_${match[2].toLowerCase()}`;
    if (PRIORITY_ADMIN_TABLES.includes(tableKey) || evidenceWhitelist.has(tableKey)) {
      files.push(tableKey);
    }
  }
  return files;
}

async function countCsvFiles(dir) {
  const entries = await readdir(dir);
  return entries.filter((e) => e.toLowerCase().endsWith(".csv")).length;
}

const extractDir = process.argv[2];
if (!extractDir) {
  console.error("Usage: node debug-ingest.mjs <extractDir>");
  process.exit(1);
}

const rootCount = await countCsvFiles(extractDir);
const files = await listCsvFiles(extractDir);
console.log("extractDir:", extractDir);
console.log("root csv count:", rootCount);
console.log("ingest file count:", files.length);
console.log("has admin_projects:", files.includes("admin_projects"));
console.log("files:", files);
