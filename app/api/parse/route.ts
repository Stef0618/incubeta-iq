import { NextResponse } from "next/server";
import { requireSession } from "@/auth";
import { parseResume } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 60;

// Extracts plain text from an uploaded PDF/DOCX (used for JD import in
// Step 1). Same in-memory, nothing-persisted handling as resume scoring.

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
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Request must include a file" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `${file.name} exceeds the 10 MB limit` },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await parseResume(buffer, file.name);
    return NextResponse.json({ text });
  } catch (err) {
    console.error(`Text extraction failed for ${file.name}:`, err);
    const message =
      err instanceof Error ? err.message : "Text extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
