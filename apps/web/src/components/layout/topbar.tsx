"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  userName: string;
  accountName?: string | null;
  exportDate?: string | null;
}

export function TopBar({ userName, accountName, exportDate }: TopBarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Portfolio Overview
        </p>
        <h1 className="text-lg font-semibold text-foreground">
          {accountName ?? "No account loaded"}
        </h1>
      </div>
      <div className="flex items-center gap-4">
        {exportDate ? (
          <div className="hidden text-right md:block">
            <p className="text-xs text-muted-foreground">Export date</p>
            <p className="text-sm font-medium">{exportDate}</p>
          </div>
        ) : null}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Signed in</p>
          <p className="text-sm font-medium">{userName}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
