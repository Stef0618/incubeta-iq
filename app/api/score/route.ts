import { NextResponse } from "next/server";
import { requireSession } from "@/auth";
import { parseResume } from "@/lib/parsers";
import { scoreResume } from "@/lib/ai/scoring";
import type { Rubric } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Scores one resume per request. The client iterates over files with
// limited concurrency so a batch failure loses at most the in-flight
// resumes. Nothing is persisted: the file is parsed in-memory, scored,
// and discarded.

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const authError = await requireSession();
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  const rubricJson = form.get("rubric");
  if (!(file instanceof File) || typeof rubricJson !== "string") {
    return NextResponse.json(
      { error: "Request must include a file and a rubric" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `${file.name} exceeds the 10 MB limit` },
      { status: 400 }
    );
  }

  let rubric: Rubric;
  try {
    rubric = JSON.parse(rubricJson);
  } catch {
    return NextResponse.json({ error: "Invalid rubric JSON" }, { status: 400 });
  }
  if (!rubric.categories?.length) {
    return NextResponse.json(
      { error: "Rubric has no categories" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await parseResume(buffer, file.name);
    const score = await scoreResume(text, file.name, rubric);
    return NextResponse.json({ score });
  } catch (err) {
    console.error(`Scoring failed for ${file.name}:`, err);
    const message = err instanceof Error ? err.message : "Scoring failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
