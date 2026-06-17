export type InvolvementLevel = "low" | "medium" | "high" | "critical";
export type MigrationProfile = "docs-only" | "rcw-critical" | "workflow-heavy" | "standard";
export type FactorSeverity = "low" | "medium" | "high" | "critical";

/**
 * Calibrated from SP0390 (Breslauer Straße School Complex) migration metrics.
 * Consultant task times scale linearly by item count; client time is limited to
 * RVT cloud model support and Formsi checklist configuration.
 */
const BENCHMARK = {
  folders: { items: 106, consultantMinutes: 12 },
  files: { items: 1199, consultantMinutes: 13 },
  sheets: { items: 245, consultantMinutes: 32 },
  issues: { items: 1357, consultantMinutes: 12 },
  checklists: { items: 56, consultantMinutes: 32 },
  rvtInit: { items: 74, consultantMinutes: 45 },
  rvtLinkFix: { items: 68, consultantMinutes: 106 },
  rvtInitClientMinutes: 30,
  rvtLinkFixClientMinutes: 15,
  projectSetupMinutes: 3,
  maxConsultantHours: 4,
} as const;

export interface MigrationFeatureCounts {
  issues: number;
  reviews: number;
  checklists: number;
  submittals: number;
  rfis: number;
  forms: number;
  clashes: number;
  transmittals: number;
  assets: number;
  sheets: number;
}

export interface MigrationEstimateInput {
  accProject: boolean;
  totalMemberSize: number | null;
  totalCompanySize: number | null;
  folders: number;
  files: number;
  versions: number;
  adminCount: number;
  serviceCount: number;
  features: MigrationFeatureCounts;
  c4rCount: number;
  rvtCount: number;
  dwgCount: number;
  hasRevitOrCad: boolean;
}

export interface MigrationEffortFactor {
  key: string;
  label: string;
  consultantHours: number;
  clientHours: number;
  severity: FactorSeverity;
  detail: string;
}

export interface MigrationEstimate {
  profile: MigrationProfile;
  profileLabel: string;
  consultantHours: number;
  clientHours: number;
  effortHours: number;
  consultantLabel: string;
  clientLabel: string;
  effortLabel: string;
  complexityScore: number;
  involvementLevel: InvolvementLevel;
  involvementLabel: string;
  involvementReasons: string[];
  effortFactors: MigrationEffortFactor[];
  driverSummary: string;
  migrationCandidate: boolean;
  rvtModelCount: number;
}

const INVOLVEMENT_LABELS: Record<InvolvementLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const PROFILE_LABELS: Record<MigrationProfile, string> = {
  "docs-only": "Docs-only",
  "rcw-critical": "RCW / RVT models",
  "workflow-heavy": "Workflow-heavy",
  standard: "Standard",
};

const CONSULTANT_ONLY_WORKFLOWS: Array<{
  key: keyof MigrationFeatureCounts;
  label: string;
  secondsPerItem: number;
  severity: FactorSeverity;
}> = [
  { key: "reviews", label: "Reviews", secondsPerItem: 2, severity: "high" },
  { key: "submittals", label: "Submittals", secondsPerItem: 1.5, severity: "high" },
  { key: "rfis", label: "RFIs", secondsPerItem: 1, severity: "medium" },
  { key: "forms", label: "Forms", secondsPerItem: 1, severity: "medium" },
  { key: "clashes", label: "Clashes", secondsPerItem: 2, severity: "high" },
  { key: "transmittals", label: "Transmittals", secondsPerItem: 1, severity: "medium" },
  { key: "assets", label: "Assets", secondsPerItem: 1.5, severity: "high" },
];

function roundHours(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

function minutesFromBenchmark(count: number, referenceItems: number, referenceMinutes: number): number {
  if (count <= 0 || referenceItems <= 0) {
    return 0;
  }
  return (count / referenceItems) * referenceMinutes;
}

function minutesToHours(minutes: number): number {
  return roundHours(minutes / 60);
}

function formatDurationLabel(hours: number): string {
  const minutes = hours * 60;
  if (minutes < 1) {
    return "< 1 min";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  if (hours < 4) {
    const wholeHours = Math.floor(hours);
    const remainder = Math.round((hours - wholeHours) * 60);
    return remainder > 0 ? `${wholeHours}h ${remainder}m` : `${wholeHours}h`;
  }
  if (hours < 16) {
    return "4–16 hours (~1–2 days)";
  }
  return "2+ days";
}

function involvementFromClientHours(hours: number): InvolvementLevel {
  if (hours >= 3) {
    return "critical";
  }
  if (hours >= 1.5) {
    return "high";
  }
  if (hours >= 0.5) {
    return "medium";
  }
  return "low";
}

function resolveRvtModelCount(input: MigrationEstimateInput): number {
  if (input.c4rCount > 0) {
    return input.c4rCount;
  }
  return input.rvtCount;
}

function estimateLinkFixModelCount(rvtModels: number): number {
  if (rvtModels <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(rvtModels * (BENCHMARK.rvtLinkFix.items / BENCHMARK.rvtInit.items)));
}

function estimateFormsiClientMinutes(checklistCount: number): number {
  if (checklistCount <= 0) {
    return 0;
  }
  if (checklistCount <= 10) {
    return 20;
  }
  if (checklistCount <= 50) {
    return 35;
  }
  return 45;
}

export function parseFormatSummary(formatSummary: unknown): Record<string, number> {
  if (!formatSummary || typeof formatSummary !== "object") {
    return {};
  }
  return formatSummary as Record<string, number>;
}

export function buildFormatCounts(formatSummary: unknown): {
  c4rCount: number;
  rvtCount: number;
  dwgCount: number;
  hasRevitOrCad: boolean;
} {
  const summary = parseFormatSummary(formatSummary);
  const cadKeys = ["rvt", "dwg", "dxf", "nwc", "nwd", "ifc", "c4r"];
  return {
    c4rCount: summary.c4r ?? 0,
    rvtCount: summary.rvt ?? 0,
    dwgCount: summary.dwg ?? 0,
    hasRevitOrCad: cadKeys.some((key) => (summary[key] ?? 0) > 0),
  };
}

export function buildFeatureCounts(
  features: Record<string, number>,
): MigrationFeatureCounts {
  return {
    issues: features.issues ?? 0,
    reviews: features.reviews ?? 0,
    checklists: features.checklists ?? 0,
    submittals: features.submittals ?? 0,
    rfis: features.rfis ?? 0,
    forms: features.forms ?? 0,
    clashes: features.clashes ?? 0,
    transmittals: features.transmittals ?? 0,
    assets: features.assets ?? 0,
    sheets: features.sheets ?? 0,
  };
}

function workflowRecordTotal(features: MigrationFeatureCounts): number {
  return (
    features.issues +
    features.reviews +
    features.checklists +
    features.submittals +
    features.rfis +
    features.forms +
    features.clashes +
    features.transmittals +
    features.assets
  );
}

function activeWorkflowCount(features: MigrationFeatureCounts): number {
  const keys: Array<keyof MigrationFeatureCounts> = [
    "issues",
    "reviews",
    "checklists",
    "submittals",
    "rfis",
    "forms",
    "clashes",
    "transmittals",
    "assets",
  ];
  return keys.filter((key) => features[key] > 0).length;
}

function detectProfile(
  rvtModels: number,
  features: MigrationFeatureCounts,
): MigrationProfile {
  if (rvtModels > 0) {
    return "rcw-critical";
  }

  const workflowTotal = workflowRecordTotal(features);
  if (workflowTotal === 0) {
    return "docs-only";
  }
  if (workflowTotal >= 100 || activeWorkflowCount(features) >= 3) {
    return "workflow-heavy";
  }
  return "standard";
}

export function estimateMigration(input: MigrationEstimateInput): MigrationEstimate {
  const features = input.features;
  const factors: MigrationEffortFactor[] = [];
  const rvtModels = resolveRvtModelCount(input);
  const linkFixModels = estimateLinkFixModelCount(rvtModels);

  factors.push({
    key: "setup",
    label: "Project setup",
    consultantHours: minutesToHours(BENCHMARK.projectSetupMinutes),
    clientHours: 0,
    severity: "low",
    detail: "Read source BIM 360 project and configure Forma/ACC target settings",
  });

  const folderMinutes = minutesFromBenchmark(
    input.folders,
    BENCHMARK.folders.items,
    BENCHMARK.folders.consultantMinutes,
  );
  if (folderMinutes > 0) {
    factors.push({
      key: "folders",
      label: "Recreating folders",
      consultantHours: minutesToHours(folderMinutes),
      clientHours: 0,
      severity: "low",
      detail: `${input.folders.toLocaleString()} folders with permission mapping (consultant automated)`,
    });
  }

  const fileMinutes = minutesFromBenchmark(
    input.files,
    BENCHMARK.files.items,
    BENCHMARK.files.consultantMinutes,
  );
  if (fileMinutes > 0) {
    factors.push({
      key: "files",
      label: "Copying files",
      consultantHours: minutesToHours(fileMinutes),
      clientHours: 0,
      severity: input.files >= 500 ? "medium" : "low",
      detail: `${input.files.toLocaleString()} files · all versions and custom attributes (consultant automated)`,
    });
  }

  const sheetMinutes = minutesFromBenchmark(
    features.sheets,
    BENCHMARK.sheets.items,
    BENCHMARK.sheets.consultantMinutes,
  );
  if (sheetMinutes > 0) {
    factors.push({
      key: "sheets",
      label: "Re-creating plans",
      consultantHours: minutesToHours(sheetMinutes),
      clientHours: 0,
      severity: "medium",
      detail: `${features.sheets.toLocaleString()} plan/sheet records (consultant automated download & upload)`,
    });
  }

  const issueMinutes = minutesFromBenchmark(
    features.issues,
    BENCHMARK.issues.items,
    BENCHMARK.issues.consultantMinutes,
  );
  if (issueMinutes > 0) {
    factors.push({
      key: "issues",
      label: "Re-creating issues",
      consultantHours: minutesToHours(issueMinutes),
      clientHours: 0,
      severity: "medium",
      detail: `${features.issues.toLocaleString()} issues · types, root cause, locations (consultant automated)`,
    });
  }

  const checklistConsultantMinutes = minutesFromBenchmark(
    features.checklists,
    BENCHMARK.checklists.items,
    BENCHMARK.checklists.consultantMinutes,
  );
  if (features.checklists > 0) {
    factors.push({
      key: "checklists",
      label: "Re-creating checklists",
      consultantHours: minutesToHours(checklistConsultantMinutes),
      clientHours: minutesToHours(estimateFormsiClientMinutes(features.checklists)),
      severity: "high",
      detail: `${features.checklists.toLocaleString()} checklists · consultant migrates data; client configures Formsi templates manually`,
    });
  }

  for (const workflow of CONSULTANT_ONLY_WORKFLOWS) {
    const count = features[workflow.key];
    if (count <= 0) {
      continue;
    }
    factors.push({
      key: workflow.key,
      label: workflow.label,
      consultantHours: minutesToHours((count * workflow.secondsPerItem) / 60),
      clientHours: 0,
      severity: workflow.severity,
      detail: `${count.toLocaleString()} records (consultant automated)`,
    });
  }

  if (rvtModels > 0) {
    const initMinutes = minutesFromBenchmark(
      rvtModels,
      BENCHMARK.rvtInit.items,
      BENCHMARK.rvtInit.consultantMinutes,
    );
    const initClientMinutes =
      (rvtModels / BENCHMARK.rvtInit.items) * BENCHMARK.rvtInitClientMinutes;

    factors.push({
      key: "rvt-init",
      label: "Initiating Revit cloud models",
      consultantHours: minutesToHours(initMinutes),
      clientHours: minutesToHours(initClientMinutes),
      severity: "critical",
      detail: `${rvtModels} RVT/C4R model(s) · client supports initiation (no storage cap on v1)`,
    });

    const linkMinutes = minutesFromBenchmark(
      linkFixModels,
      BENCHMARK.rvtLinkFix.items,
      BENCHMARK.rvtLinkFix.consultantMinutes,
    );
    const linkClientMinutes =
      (linkFixModels / BENCHMARK.rvtLinkFix.items) * BENCHMARK.rvtLinkFixClientMinutes;

    factors.push({
      key: "rvt-links",
      label: "Fixing links in Revit models",
      consultantHours: minutesToHours(linkMinutes),
      clientHours: minutesToHours(linkClientMinutes),
      severity: "critical",
      detail: `${linkFixModels} model(s) · reload RVT/xrefs — highest consultant effort (SP0390: 1h 46m)`,
    });
  }

  let consultantHours = roundHours(
    factors.reduce((sum, factor) => sum + factor.consultantHours, 0),
  );
  const clientHours = roundHours(
    factors.reduce((sum, factor) => sum + factor.clientHours, 0),
  );

  if (consultantHours === 0) {
    consultantHours = minutesToHours(5);
    factors.push({
      key: "baseline",
      label: "Minimal docs migration",
      consultantHours,
      clientHours: 0,
      severity: "low",
      detail: "Small folder/file inventory — typically a few minutes of consultant runtime",
    });
  }

  consultantHours = Math.min(consultantHours, BENCHMARK.maxConsultantHours);

  const profile = detectProfile(rvtModels, features);
  const sortedFactors = [...factors].sort(
    (a, b) =>
      b.consultantHours +
      b.clientHours -
      (a.consultantHours + a.clientHours),
  );
  const driverSummary =
    sortedFactors.length > 0
      ? sortedFactors
          .slice(0, 3)
          .map((factor) => factor.label)
          .join(", ")
      : "Docs baseline only";

  const involvementLevel = involvementFromClientHours(clientHours);
  const clientReasons = sortedFactors
    .filter((factor) => factor.clientHours > 0)
    .slice(0, 4)
    .map((factor) => `${factor.label}: ~${formatDurationLabel(factor.clientHours)}`);

  const complexityScore = Math.min(
    100,
    Math.round(
      (consultantHours / BENCHMARK.maxConsultantHours) * 55 +
        (rvtModels > 0 ? 25 : 0) +
        Math.log10(Math.max(workflowRecordTotal(features), 1) + 1) * 8 +
        (features.checklists > 0 ? 8 : 0),
    ),
  );

  return {
    profile,
    profileLabel: PROFILE_LABELS[profile],
    consultantHours,
    clientHours,
    effortHours: consultantHours,
    consultantLabel: formatDurationLabel(consultantHours),
    clientLabel: formatDurationLabel(clientHours),
    effortLabel: formatDurationLabel(consultantHours),
    complexityScore,
    involvementLevel,
    involvementLabel: INVOLVEMENT_LABELS[involvementLevel],
    involvementReasons:
      clientReasons.length > 0
        ? clientReasons
        : ["No client-side RVT support or Formsi checklist setup expected"],
    effortFactors: sortedFactors,
    driverSummary,
    migrationCandidate: !input.accProject,
    rvtModelCount: rvtModels,
  };
}

export function sumSelectedEffort(
  projects: Array<{ syncDocs: boolean; migration: MigrationEstimate }>,
): number {
  return projects
    .filter((project) => project.syncDocs)
    .reduce((sum, project) => sum + project.migration.consultantHours, 0);
}

export function sumSelectedClientEffort(
  projects: Array<{ syncDocs: boolean; migration: MigrationEstimate }>,
): number {
  return projects
    .filter((project) => project.syncDocs)
    .reduce((sum, project) => sum + project.migration.clientHours, 0);
}
