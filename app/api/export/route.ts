import { NextResponse } from "next/server";
import { requireSession } from "@/auth";
import { exportToSheet } from "@/lib/sheets/export";
import type { CandidateScore, Rubric } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExportRequest {
  rubric: Rubric;
  scores: CandidateScore[];
}

export async function POST(request: Request) {
  const authError = await requireSession();
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let body: ExportRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.rubric?.categories?.length || !body.scores?.length) {
    return NextResponse.json(
      { error: "Export requires a rubric and at least one scored candidate" },
      { status: 400 }
    );
  }

  try {
    const result = await exportToSheet(body.rubric, body.scores);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Sheets export failed:", err);
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
