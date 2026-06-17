#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const DB_USER = "hublens";
const DB_PASSWORD = "hublens";
const DB_NAME = "hublens";
const DB_SCHEMA = "hublens";

function log(message) {
  console.log(`\n> ${message}`);
}

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

function commandExists(name) {
  const check = process.platform === "win32" ? "where" : "command -v";
  const result = spawnSync(check, [name], { shell: true, stdio: "ignore" });
  return result.status === 0;
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function checkNodeVersion() {
  const major = Number.parseInt(process.version.slice(1).split(".")[0] ?? "0", 10);
  if (major < 20) {
    fail("Node.js 20 or later is required.");
  }
}

function ensurePnpm() {
  if (commandExists("pnpm")) {
    return;
  }

  log("Enabling pnpm via Corepack…");
  run("corepack", ["enable"]);
  run("corepack", ["prepare", "pnpm@9.15.0", "--activate"]);
}

function findPsql() {
  if (commandExists("psql")) {
    return "psql";
  }

  if (process.platform === "win32") {
    for (const version of [17, 16, 15]) {
      const candidate = `C:\\Program Files\\PostgreSQL\\${version}\\bin\\psql.exe`;
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  fail(
    "PostgreSQL client (psql) not found. Install PostgreSQL 16 and ensure psql is on your PATH.",
  );
}

function runPsql(psql, { user, password, database, sql }) {
  return spawnSync(
    psql,
    ["-U", user, "-h", "localhost", "-p", "5432", "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      env: { ...process.env, PGPASSWORD: password },
      stdio: "pipe",
      encoding: "utf8",
    },
  );
}

function setupEnvFiles() {
  const webExample = path.join(root, "apps", "web", ".env.example");
  const webEnv = path.join(root, "apps", "web", ".env.local");
  const dbEnv = path.join(root, "packages", "db", ".env");

  if (!existsSync(webExample)) {
    fail("Missing apps/web/.env.example");
  }

  if (!existsSync(webEnv)) {
    const secret = randomBytes(32).toString("base64");
    let content = readFileSync(webExample, "utf8");
    content = content.replace(
      'SESSION_SECRET="change-me-to-a-random-32-byte-secret"',
      `SESSION_SECRET="${secret}"`,
    );
    writeFileSync(webEnv, content, "utf8");
    log("Created apps/web/.env.local");
  } else {
    log("Using existing apps/web/.env.local");
  }

  if (!existsSync(dbEnv)) {
    copyFileSync(path.join(root, "packages", "db", ".env.example"), dbEnv);
    log("Created packages/db/.env");
  } else {
    log("Using existing packages/db/.env");
  }
}

async function waitForPostgresService(psql, superPassword) {
  log("Waiting for PostgreSQL on localhost:5432…");

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = runPsql(psql, {
      user: "postgres",
      password: superPassword,
      database: "postgres",
      sql: "SELECT 1",
    });

    if (result.status === 0) {
      return;
    }

    await sleep(2000);
  }

  fail(
    "PostgreSQL is not running on localhost:5432. Start the PostgreSQL service and run install again.",
  );
}

function setupDatabase(psql) {
  const hubLensReady = runPsql(psql, {
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    sql: "SELECT 1",
  });

  if (hubLensReady.status === 0) {
    log("PostgreSQL already configured for HubLens");
    return;
  }

  const superPassword = process.env.POSTGRES_SUPER_PASSWORD ?? "password";
  log("Creating HubLens database user and schema…");

  const createRole = runPsql(psql, {
    user: "postgres",
    password: superPassword,
    database: "postgres",
    sql: `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END $$;`,
  });

  if (createRole.status !== 0) {
    fail(
      "Could not create the hublens database user. Set POSTGRES_SUPER_PASSWORD to your postgres superuser password and try again.",
    );
  }

  const dbExists = runPsql(psql, {
    user: "postgres",
    password: superPassword,
    database: "postgres",
    sql: `SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`,
  });

  if (!dbExists.stdout.includes("1")) {
    const createDb = runPsql(psql, {
      user: "postgres",
      password: superPassword,
      database: "postgres",
      sql: `CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};`,
    });

    if (createDb.status !== 0) {
      fail("Could not create the hublens database.");
    }
  }

  const createSchema = runPsql(psql, {
    user: "postgres",
    password: superPassword,
    database: DB_NAME,
    sql: `
CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA} AUTHORIZATION ${DB_USER};
GRANT ALL ON SCHEMA ${DB_SCHEMA} TO ${DB_USER};`,
  });

  if (createSchema.status !== 0) {
    fail("Could not create the hublens schema.");
  }
}

async function main() {
  console.log("HubLens installer");

  checkNodeVersion();
  ensurePnpm();
  setupEnvFiles();

  const psql = findPsql();
  const superPassword = process.env.POSTGRES_SUPER_PASSWORD ?? "password";

  await waitForPostgresService(psql, superPassword);
  setupDatabase(psql);

  log("Installing dependencies…");
  run("pnpm", ["install"]);

  log("Applying database schema…");
  run("pnpm", ["db:push"]);

  console.log("\nHubLens is ready.");
  console.log("Run: pnpm dev");
  console.log("Open: http://localhost:3000");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Installation failed.");
});
