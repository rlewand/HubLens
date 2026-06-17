"use client";

import type { MaturityLevel } from "@hublens/maturity-engine";
import { MATURITY_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface MaturityCellProps {
  level: MaturityLevel;
  label?: string;
  className?: string;
}

export function MaturityCell({ level, label, className }: MaturityCellProps) {
  return (
    <span
      title={label ?? `Level ${level}`}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-md text-xs font-semibold",
        MATURITY_COLORS[level],
        className,
      )}
    >
      {level}
    </span>
  );
}
