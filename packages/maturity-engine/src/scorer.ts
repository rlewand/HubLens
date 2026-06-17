export type MaturityLevel = 0 | 1 | 2 | 3 | 4;

export const MATURITY_LABELS: Record<MaturityLevel, string> = {
  0: "Not Enabled",
  1: "Provisioned",
  2: "Adopted",
  3: "Active",
  4: "Optimized",
};

export interface ThresholdRule {
  min_records?: number;
  min_users?: number;
  max_days_since_activity?: number;
  min_related_tables?: number;
}

export interface ModuleRule {
  display_name: string;
  enabled_from: string[];
  evidence_tables: string[];
  thresholds: {
    adopted?: ThresholdRule;
    active?: ThresholdRule;
    optimized?: ThresholdRule;
  };
}

export interface MaturityRulesConfig {
  modules: Record<string, ModuleRule>;
}

export interface TableEvidence {
  tableKey: string;
  recordCount: number;
  distinctUsers: number;
  lastActivityAt: Date | null;
}

export interface ModuleEvidenceAggregate {
  moduleKey: string;
  tables: TableEvidence[];
  recordCount: number;
  distinctUsers: number;
  lastActivityAt: Date | null;
  tablesWithData: number;
}

export interface EnabledFlags {
  services: string[];
  products: string[];
}

export interface MaturityMetrics {
  enabled: boolean;
  recordCount: number;
  distinctUsers: number;
  lastActivityAt: string | null;
  tablesWithData: number;
  enabledServices: string[];
  enabledProducts: string[];
  levelLabel: string;
  reasons: string[];
}

export interface MaturityScoreResult {
  moduleKey: string;
  displayName: string;
  level: MaturityLevel;
  enabled: boolean;
  metrics: MaturityMetrics;
}

function daysSince(date: Date | null, reference: Date): number {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }
  return (reference.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function meetsThreshold(
  rule: ThresholdRule | undefined,
  evidence: ModuleEvidenceAggregate,
  reference: Date,
): boolean {
  if (!rule) {
    return false;
  }
  if (rule.min_records !== undefined && evidence.recordCount < rule.min_records) {
    return false;
  }
  if (rule.min_users !== undefined && evidence.distinctUsers < rule.min_users) {
    return false;
  }
  if (
    rule.max_days_since_activity !== undefined &&
    daysSince(evidence.lastActivityAt, reference) > rule.max_days_since_activity
  ) {
    return false;
  }
  if (
    rule.min_related_tables !== undefined &&
    evidence.tablesWithData < rule.min_related_tables
  ) {
    return false;
  }
  return true;
}

export function isModuleEnabled(
  rule: ModuleRule,
  enabled: EnabledFlags,
): boolean {
  const keys = [...enabled.services, ...enabled.products].map((k) => k.toLowerCase());
  return rule.enabled_from.some((key) => keys.includes(key.toLowerCase()));
}

export function aggregateEvidence(
  moduleKey: string,
  evidenceTables: string[],
  tableEvidence: TableEvidence[],
): ModuleEvidenceAggregate {
  const relevant = tableEvidence.filter((t) => evidenceTables.includes(t.tableKey));
  const recordCount = relevant.reduce((sum, t) => sum + t.recordCount, 0);
  const distinctUsers = relevant.reduce((max, t) => Math.max(max, t.distinctUsers), 0);
  const lastActivityAt = relevant.reduce<Date | null>((latest, t) => {
    if (!t.lastActivityAt) {
      return latest;
    }
    if (!latest || t.lastActivityAt > latest) {
      return t.lastActivityAt;
    }
    return latest;
  }, null);
  const tablesWithData = relevant.filter((t) => t.recordCount > 0).length;

  return {
    moduleKey,
    tables: relevant,
    recordCount,
    distinctUsers,
    lastActivityAt,
    tablesWithData,
  };
}

export function computeMaturityLevel(
  rule: ModuleRule,
  enabled: EnabledFlags,
  evidence: ModuleEvidenceAggregate,
  referenceDate: Date = new Date(),
): MaturityScoreResult {
  const enabledFlag = isModuleEnabled(rule, enabled);
  const reasons: string[] = [];

  if (!enabledFlag) {
    return {
      moduleKey: "",
      displayName: rule.display_name,
      level: 0,
      enabled: false,
      metrics: {
        enabled: false,
        recordCount: evidence.recordCount,
        distinctUsers: evidence.distinctUsers,
        lastActivityAt: evidence.lastActivityAt?.toISOString() ?? null,
        tablesWithData: evidence.tablesWithData,
        enabledServices: enabled.services,
        enabledProducts: enabled.products,
        levelLabel: MATURITY_LABELS[0],
        reasons: ["Service or product not enabled on project"],
      },
    };
  }

  let level: MaturityLevel = 1;
  reasons.push("Service enabled but no usage evidence yet");

  if (evidence.recordCount > 0) {
    level = 2;
    reasons.push(`${evidence.recordCount} records across ${evidence.tablesWithData} table(s)`);
  }

  if (meetsThreshold(rule.thresholds.active, evidence, referenceDate)) {
    level = 3;
    reasons.push("Meets active usage thresholds");
  }

  if (meetsThreshold(rule.thresholds.optimized, evidence, referenceDate)) {
    level = 4;
    reasons.push("Meets optimized usage thresholds");
  }

  return {
    moduleKey: "",
    displayName: rule.display_name,
    level,
    enabled: true,
    metrics: {
      enabled: true,
      recordCount: evidence.recordCount,
      distinctUsers: evidence.distinctUsers,
      lastActivityAt: evidence.lastActivityAt?.toISOString() ?? null,
      tablesWithData: evidence.tablesWithData,
      enabledServices: enabled.services,
      enabledProducts: enabled.products,
      levelLabel: MATURITY_LABELS[level],
      reasons,
    },
  };
}

export function computeOverallMaturity(scores: MaturityScoreResult[]): number {
  if (scores.length === 0) {
    return 0;
  }
  const sum = scores.reduce((acc, s) => acc + s.level, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}
