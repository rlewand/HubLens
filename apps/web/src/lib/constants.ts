import type { MaturityLevel } from "@hublens/maturity-engine";

export const MODULE_KEYS = [
  "docs",
  "build",
  "cost",
  "design_collaboration",
  "model_coordination",
  "field",
  "takeoff",
  "assets",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_SHORT_LABELS: Record<ModuleKey, string> = {
  docs: "Docs",
  build: "Build",
  cost: "Cost",
  design_collaboration: "DC",
  model_coordination: "MC",
  field: "Field",
  takeoff: "Takeoff",
  assets: "Assets",
};

export const MODULE_FULL_LABELS: Record<ModuleKey, string> = {
  docs: "Docs / Document Management",
  build: "Build / Project Management",
  cost: "Cost Management",
  design_collaboration: "Design Collaboration",
  model_coordination: "Model Coordination",
  field: "Field Management",
  takeoff: "Takeoff / Quantification",
  assets: "Assets",
};

const SERVICE_LABEL_MAP: Record<string, string> = {
  documentManagement: "Document Management",
  projectManagement: "Project Management",
  fieldManagement: "Field Management",
  costManagement: "Cost Management",
  designCollaboration: "Design Collaboration",
  modelCoordination: "Model Coordination",
  insight: "Insight",
  assets: "Assets",
  field: "Field",
  glue: "Glue",
  quantification: "Quantification",
  build: "Build",
  docs: "Docs",
  cost: "Cost",
  takeoff: "Takeoff",
  buildingConnected: "BuildingConnected",
  capitalPlanning: "Capital Planning",
  financials: "Financials",
  autoSpecs: "AutoSpecs",
  forma: "Forma",
  workshopxr: "Workshop XR",
  datum: "Datum",
  datcls: "Data Classification",
};

export function formatServiceLabel(key: string): string {
  return (
    SERVICE_LABEL_MAP[key] ??
    key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase())
  );
}

export const MATURITY_COLORS: Record<MaturityLevel, string> = {
  0: "bg-slate-200 text-slate-500",
  1: "bg-sky-100 text-sky-800",
  2: "bg-amber-100 text-amber-900",
  3: "bg-emerald-100 text-emerald-900",
  4: "bg-violet-100 text-violet-900",
};

export const MATURITY_HEX: Record<MaturityLevel, string> = {
  0: "#e2e8f0",
  1: "#e0f2fe",
  2: "#fef3c7",
  3: "#d1fae5",
  4: "#ede9fe",
};
