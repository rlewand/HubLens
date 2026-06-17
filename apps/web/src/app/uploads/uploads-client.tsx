"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileArchive, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface UploadsPageClientProps {
  userName: string;
}

interface ImportStatusPayload {
  batchId?: string;
  status?: string;
  projectCount?: number;
  errorMessage?: string | null;
  error?: string;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 1200;

export function UploadsPageClient({ userName }: UploadsPageClientProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openFilePicker() {
    inputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setMessage(null);
    setError(null);
    event.target.value = "";
  }

  async function pollImportStatus(batchId: string): Promise<ImportStatusPayload> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const response = await fetch(`/api/ingest/status?batchId=${encodeURIComponent(batchId)}`);
      const payload = (await response.json()) as ImportStatusPayload;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not read import status.");
      }

      if (payload.status === "completed") {
        return payload;
      }

      if (payload.status === "failed") {
        throw new Error(payload.errorMessage ?? "Import failed. Please try again.");
      }

      setMessage("Import running in the background…");

      await new Promise((resolve) => {
        setTimeout(resolve, POLL_INTERVAL_MS);
      });
    }

    throw new Error(
      "Import is taking longer than expected. Check the dashboard in a few minutes or upload again.",
    );
  }

  async function handleImport() {
    if (!selectedFile) {
      setError("Please select a ZIP file first.");
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".zip")) {
      setError("Only .zip archives are supported.");
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/ingest/upload", {
        method: "POST",
        body: formData,
      });

      let payload: ImportStatusPayload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Import failed. Please try again.");
      }

      if (!payload.batchId) {
        throw new Error("Import did not return a batch id.");
      }

      setMessage("ZIP uploaded — analyzing CSV files…");
      const result = await pollImportStatus(payload.batchId);

      if (!result.projectCount || result.projectCount <= 0) {
        throw new Error(
          "Import finished without loading any projects. Check that the ZIP contains a valid Data Connector export.",
        );
      }

      setMessage(`Import completed — ${result.projectCount.toLocaleString()} projects loaded.`);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell userName={userName}>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileArchive className="h-5 w-5 text-accent" />
              Import Data Connector export
            </CardTitle>
            <CardDescription>
              Select a ZIP archive exported from Autodesk ACC Data Connector. The archive should
              contain CSV files and <code>metadata.csv</code>. Large exports may take several
              minutes — keep this tab open while import runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
              <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-4 text-sm text-muted-foreground">
                {selectedFile
                  ? `Selected: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`
                  : "No file selected"}
              </p>
              <Button type="button" variant="secondary" onClick={openFilePicker} disabled={loading}>
                Select ZIP file…
              </Button>
            </div>

            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={handleImport}
              disabled={loading || !selectedFile}
            >
              {loading ? "Importing…" : "Import and analyze"}
            </Button>

            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
