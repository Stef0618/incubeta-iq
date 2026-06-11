import { NextResponse } from "next/server";
import { requireSession } from "@/auth";
import { generateQuestions, generateRubric } from "@/lib/ai/rubric";
import type { QuestionAnswer } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300; // Opus rubric generation can take a while

interface RubricRequest {
  action: "questions" | "generate";
  roleTitle: string;
  jobDescription: string;
  scoringCriteria: string;
  answers?: QuestionAnswer[];
}

export async function POST(request: Request) {
  const authError = await requireSession();
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let body: RubricRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, roleTitle, jobDescription, scoringCriteria, answers } = body;
  if (!roleTitle?.trim() || !jobDescription?.trim()) {
    return NextResponse.json(
      { error: "roleTitle and jobDescription are required" },
      { status: 400 }
    );
  }

  const inputs = {
    roleTitle: roleTitle.trim(),
    jobDescription: jobDescription.trim(),
    scoringCriteria: scoringCriteria?.trim() ?? "",
  };

  try {
    if (action === "questions") {
      const questions = await generateQuestions(inputs);
      return NextResponse.json({ questions });
    }
    if (action === "generate") {
      const rubric = await generateRubric(inputs, answers ?? []);
      return NextResponse.json({ rubric });
    }
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    console.error("Rubric generation failed:", err);
    const message = err instanceof Error ? err.message : "Rubric generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
