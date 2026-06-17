"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MigrationProfile } from "@/lib/migration-estimate";
import {
  countActiveMigrationFilters,
  DEFAULT_MIGRATION_FILTERS,
  type MigrationPortfolioFilters,
  type MigrationScanFilter,
} from "@/lib/migration-portfolio-filters";
import { cn } from "@/lib/utils";

interface MigrationPortfolioFilterBarProps {
  filters: MigrationPortfolioFilters;
  onChange: (filters: MigrationPortfolioFilters) => void;
  totalCount: number;
  filteredCount: number;
}

const PROFILE_OPTIONS: Array<{ value: MigrationProfile | "all"; label: string }> = [
  { value: "all", label: "All profiles" },
  { value: "docs-only", label: "Docs only" },
  { value: "standard", label: "Standard" },
  { value: "workflow-heavy", label: "Workflow-heavy" },
  { value: "rcw-critical", label: "RCW / RVT models" },
];

const SCAN_OPTIONS: Array<{ value: MigrationScanFilter; label: string }> = [
  { value: "all", label: "Any scan status" },
  { value: "scanned", label: "Scanned" },
  { value: "not-scanned", label: "Not scanned" },
  { value: "failed", label: "Scan failed" },
];

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function MigrationPortfolioFilterBar({
  filters,
  onChange,
  totalCount,
  filteredCount,
}: MigrationPortfolioFilterBarProps) {
  const activeCount = countActiveMigrationFilters(filters);

  function update(partial: Partial<MigrationPortfolioFilters>) {
    onChange({ ...filters, ...partial });
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium">Migration filters</p>
          <p className="text-xs text-muted-foreground">
            {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} projects match
            {activeCount > 0 ? ` · ${activeCount} filter${activeCount === 1 ? "" : "s"} active` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={activeCount === 0}
          onClick={() => onChange(DEFAULT_MIGRATION_FILTERS)}
        >
          Clear filters
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <FilterField label="Start from">
          <Input
            type="date"
            value={filters.startDateFrom}
            onChange={(event) => update({ startDateFrom: event.target.value })}
          />
        </FilterField>
        <FilterField label="Start until">
          <Input
            type="date"
            value={filters.startDateTo}
            onChange={(event) => update({ startDateTo: event.target.value })}
          />
        </FilterField>
        <FilterField label="End from">
          <Input
            type="date"
            value={filters.endDateFrom}
            onChange={(event) => update({ endDateFrom: event.target.value })}
          />
        </FilterField>
        <FilterField label="End until">
          <Input
            type="date"
            value={filters.endDateTo}
            onChange={(event) => update({ endDateTo: event.target.value })}
          />
        </FilterField>
        <FilterField label="Min members">
          <Input
            type="number"
            min={0}
            placeholder="Any"
            value={filters.membersMin}
            onChange={(event) => update({ membersMin: event.target.value })}
          />
        </FilterField>
        <FilterField label="Max members">
          <Input
            type="number"
            min={0}
            placeholder="Any"
            value={filters.membersMax}
            onChange={(event) => update({ membersMax: event.target.value })}
          />
        </FilterField>
        <FilterField label="Max migration (h)">
          <Input
            type="number"
            min={0}
            step={0.5}
            placeholder="Any"
            value={filters.consultantHoursMax}
            onChange={(event) => update({ consultantHoursMax: event.target.value })}
          />
        </FilterField>
        <FilterField label="Max client setup (h)">
          <Input
            type="number"
            min={0}
            step={0.5}
            placeholder="Any"
            value={filters.clientHoursMax}
            onChange={(event) => update({ clientHoursMax: event.target.value })}
          />
        </FilterField>
        <FilterField label="Max folders">
          <Input
            type="number"
            min={0}
            placeholder="Any"
            value={filters.foldersMax}
            onChange={(event) => update({ foldersMax: event.target.value })}
          />
        </FilterField>
        <FilterField label="Max files">
          <Input
            type="number"
            min={0}
            placeholder="Any"
            value={filters.filesMax}
            onChange={(event) => update({ filesMax: event.target.value })}
          />
        </FilterField>
        <FilterField label="Profile">
          <select
            value={filters.profile}
            onChange={(event) =>
              update({ profile: event.target.value as MigrationPortfolioFilters["profile"] })
            }
            className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
          >
            {PROFILE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Docs scan">
          <select
            value={filters.scanStatus}
            onChange={(event) =>
              update({ scanStatus: event.target.value as MigrationScanFilter })
            }
            className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
          >
            {SCAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={filters.candidatesOnly}
          onChange={(event) => update({ candidatesOnly: event.target.checked })}
          className="rounded border-border"
        />
        Migration candidates only
      </label>
    </div>
  );
}
