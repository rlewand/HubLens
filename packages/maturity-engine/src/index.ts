import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { MaturityRulesConfig } from "./scorer";

export function loadMaturityRulesFromFile(filePath: string): MaturityRulesConfig {
  const raw = readFileSync(filePath, "utf8");
  return parse(raw) as MaturityRulesConfig;
}

export * from "./scorer";
export * from "./features";
