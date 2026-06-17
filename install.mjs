#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

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

function ensureDocker() {
  if (!commandExists("docker")) {
    fail("Docker is required. Install Docker Desktop and try again.");
  }

  const info = spawnSync("docker", ["info"], { shell: true, stdio: "ignore" });
  if (info.status !== 0) {
    fail("Docker is installed but not running. Start Docker Desktop and try again.");
  }
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

async function waitForPostgres() {
  log("Waiting for PostgreSQL…");

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "hublens", "-d", "hublens"],
      { cwd: root, shell: true, stdio: "ignore" },
    );

    if (result.status === 0) {
      return;
    }

    await sleep(2000);
  }

  fail("PostgreSQL did not become ready. Check Docker logs with: docker compose logs postgres");
}

async function main() {
  console.log("HubLens installer");

  checkNodeVersion();
  ensureDocker();
  ensurePnpm();
  setupEnvFiles();

  log("Installing dependencies…");
  run("pnpm", ["install"]);

  log("Starting PostgreSQL…");
  run("docker", ["compose", "up", "-d"]);

  await waitForPostgres();

  log("Applying database schema…");
  run("pnpm", ["db:push"]);

  console.log("\nHubLens is ready.");
  console.log("Run: pnpm dev");
  console.log("Open: http://localhost:3000");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Installation failed.");
});
