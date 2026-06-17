import { NextResponse } from "next/server";
import { getInputDir } from "@/lib/auth";
import { runIngest } from "@/lib/ingest/importer";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngest(session.id, getInputDir());
    return NextResponse.json({
      batchId: result.batchId,
      projectCount: result.projectCount,
      ok: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
