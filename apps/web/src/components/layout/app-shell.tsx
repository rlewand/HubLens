import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

interface AppShellProps {
  children: ReactNode;
  userName: string;
  accountName?: string | null;
  exportDate?: string | null;
}

export function AppShell({ children, userName, accountName, exportDate }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={userName} accountName={accountName} exportDate={exportDate} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
