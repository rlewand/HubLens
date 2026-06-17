import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const inputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../Input",
);

const testCases = [
  {
    label: "Medium project EF0745 (~499 issues, BIM 360)",
    projectId: "820af33b-9af2-4778-8d34-2c08774c6ccf",
  },
  {
    label: "GB1969 Testprojekt BIM (1 active version in export)",
    projectId: "db3b9fcc-4682-471a-9404-f71d183c8606",
  },
  {
    label: "GB1969 Digitale Planfreigabe (1 active + 2 trashed)",
    projectId: "6ff87359-1cf4-4e3c-9bcd-e046336e0143",
  },
  {
    label: "LF0192 (3 trashed versions only)",
    projectId: "6b355274-cf4d-4739-8284-9e22522bcc85",
  },
];

function isTrashed(value) {
  return value?.toLowerCase() === "t" || value?.toLowerCase() === "true";
}

async function measureProject(projectId) {
  const filePath = path.join(inputDir, "packages_version_resources.csv");
  const acc = {
    folders: new Set(),
    files: new Set(),
    versions: 0,
    trashedVersions: 0,
    users: new Set(),
  };

  await new Promise((resolve, reject) => {
    Papa.parse(createReadStream(filePath), {
      header: true,
      skipEmptyLines: true,
      step: (result) => {
        const row = result.data;
        if (row.bim360_project_id !== projectId) {
          return;
        }
        if (isTrashed(row.trashed)) {
          acc.trashedVersions += 1;
          return;
        }
        acc.versions += 1;
        if (row.urn) acc.files.add(row.urn);
        if (row.path) acc.folders.add(row.path);
        const user = row.updated_by || row.created_by;
        if (user) acc.users.add(user);
      },
      complete: resolve,
      error: reject,
    });
  });

  return {
    folders: acc.folders.size,
    files: acc.files.size,
    versions: acc.versions,
    trashedVersions: acc.trashedVersions,
    users: acc.users.size,
  };
}

for (const testCase of testCases) {
  const result = await measureProject(testCase.projectId);
  console.log(`\n=== ${testCase.label} ===`);
  console.log(`Project ID: ${testCase.projectId}`);
  console.log(`Folders (active): ${result.folders}`);
  console.log(`Files (active): ${result.files}`);
  console.log(`Versions (active): ${result.versions}`);
  console.log(`Versions (trashed): ${result.trashedVersions}`);
  console.log(`Users: ${result.users}`);
  if (result.versions === 0 && result.trashedVersions === 0) {
    console.log("(No rows in packages_version_resources.csv for this project)");
  }
}

console.log("\nSource: packages_version_resources.csv (packages.json schema)");
