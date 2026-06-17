"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PortfolioStatusFilter = "active" | "archived";

interface FilterBarProps {
  status: PortfolioStatusFilter;
  search: string;
  totalCount: number;
  filteredCount: number;
  onStatusChange: (value: PortfolioStatusFilter) => void;
  onSearchChange: (value: string) => void;
}

const STATUS_OPTIONS: Array<{ value: PortfolioStatusFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export function FilterBar({
  status,
  search,
  totalCount,
  filteredCount,
  onStatusChange,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">Portfolio filters</p>
          <p className="text-xs text-muted-foreground">
            BIM 360 projects · {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}{" "}
            shown
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusChange(option.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  status === option.value
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
