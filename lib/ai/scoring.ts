import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getToolInput, SCORING_MODEL } from "./client";
import type { Band, CandidateScore, Rubric } from "@/types";

// Step 3: resume scoring. Runs on Haiku, once per resume.
// The model assesses; the server does the arithmetic. Weighted sums,
// deductions, and banding are computed here so a model slip in math
// can never change a candidate's rank.

const SCORE_TOOL: Anthropic.Tool = {
  name: "submit_assessment",
  description: "Submit the structured assessment of one candidate's resume.",
  input_schema: {
    type: "object",
    properties: {
      candidateName: {
        type: "string",
        description: "Candidate's full name as written on the resume",
      },
      disqualified: { type: "boolean" },
      disqualifierReason: {
        type: "string",
        description:
          "Which disqualifier was met and the evidence. Empty string if not disqualified.",
      },
      categoryScores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            categoryId: { type: "string" },
            score: {
              type: "number",
              description:
                "1-4 against the category's level descriptors. Half points (e.g. 2.5) allowed when evidence falls between levels.",
            },
            evidence: {
              type: "string",
              description: "One or two sentences citing resume evidence",
            },
          },
          required: ["categoryId", "score", "evidence"],
        },
      },
      redFlagsTriggered: {
        type: "array",
        items: {
          type: "object",
          properties: {
            redFlagId: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["redFlagId", "evidence"],
        },
      },
      bonusesAwarded: {
        type: "array",
        items: {
          type: "object",
          properties: {
            bonusId: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["bonusId", "evidence"],
        },
      },
      summary: {
        type: "string",
        description:
          "3-5 sentence evaluator summary: overall fit, key strengths, key gaps",
      },
    },
    required: [
      "candidateName",
      "disqualified",
      "disqualifierReason",
      "categoryScores",
      "redFlagsTriggered",
      "bonusesAwarded",
      "summary",
    ],
  },
};

function rubricPrompt(rubric: Rubric): string {
  const categories = rubric.categories
    .map((c) => {
      const levels = c.levels
        .map((l) => `    ${l.score} (${l.label}): ${l.description}`)
        .join("\n");
      const criteria = c.criteria.map((cr) => `    - ${cr.text}`).join("\n");
      return `Category ${c.id}: ${c.name} (weight ${c.weight}%)\n  Criteria:\n${criteria}\n  Levels:\n${levels}`;
    })
    .join("\n\n");

  const redFlags = rubric.redFlags
    .map((r) => `  ${r.id}: ${r.text} (deduction ${r.deduction})`)
    .join("\n");
  const bonuses = rubric.bonusCriteria
    .map((b) => `  ${b.id}: ${b.text} (bonus ${b.points})`)
    .join("\n");
  const disqualifiers = rubric.disqualifiers
    .map((d) => `  ${d.id}: ${d.text}`)
    .join("\n");

  return [
    `Role: ${rubric.roleTitle}`,
    `DISQUALIFIERS (check these first; if any is met, mark disqualified and stop scoring):\n${disqualifiers || "  none"}`,
    `CATEGORIES:\n${categories}`,
    `RED FLAGS:\n${redFlags || "  none"}`,
    `BONUS CRITERIA:\n${bonuses || "  none"}`,
  ].join("\n\n");
}

export function bandFor(finalScore: number, disqualified: boolean): Band {
  if (disqualified) return "DECLINE";
  if (finalScore >= 3.0) return "ADVANCE";
  if (finalScore >= 2.5) return "CONSIDER";
  if (finalScore >= 2.0) return "BORDERLINE";
  return "DECLINE";
}

// Diagnostic: print a one-line tagged record to the server terminal whenever a
// scoring call fails, so we can tell the failure modes apart (truncation vs
// off-schema vs rate limit) and see how close we are to the token budget.
// Off by default; set SCORE_DEBUG=1 in the environment to enable. These are
// internal-retry diagnostics, not user-facing — most retries now resolve
// silently, so the logs are only useful when investigating failure patterns.
function logFailure(
  fileName: string,
  kind: string,
  details: Record<string, unknown>
) {
  if (process.env.SCORE_DEBUG !== "1") return;
  const parts = Object.entries(details).map(([k, v]) => `${k}=${v}`);
  console.error(`[SCORE-FAIL] ${kind} | file="${fileName}" | ${parts.join(" ")}`);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

// Forced tool-use constrains the schema but not the runtime types of nested
// values. Haiku occasionally returns array fields as JSON-encoded strings
// (e.g. "[{...}]") rather than parsed arrays. Coerce defensively: parse a
// string into an array, and treat anything that isn't an array as empty so
// downstream .find / .flatMap calls never crash.
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Haiku intermittently returns off-schema tool output (most commonly
// categoryScores as a JSON string with botched internal escaping, which then
// fails to parse) or, rarely, truncates. Both are transient: a fresh sample
// usually comes back clean. So we resample on the server up to this many times
// before surfacing a failure to the user, instead of making HR click "Retry".
const MAX_SCORING_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scoreResume(
  resumeText: string,
  fileName: string,
  rubric: Rubric
): Promise<CandidateScore> {
  for (let attempt = 1; attempt <= MAX_SCORING_ATTEMPTS; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await getAnthropic().messages.create({
        model: SCORING_MODEL,
        max_tokens: 3000,
        // Low-but-nonzero: cuts off-schema rate and keeps scores reasonably
        // reproducible, while leaving enough sampling variance that the retry
        // loop above can draw a clean response after an off-schema one. Do not
        // set to 0 — that makes off-schema responses reproduce on every retry.
        temperature: 0.5,
        system:
          "You are Recruit IQ, scoring one resume against an approved evaluation rubric for first-stage triage. " +
          "Check disqualifiers first: if any is clearly met, mark the candidate disqualified and do not score categories. " +
          "Otherwise score every category 1-4 against its level descriptors, citing resume evidence. " +
          "Only flag red flags and award bonuses with clear evidence; when in doubt, do not. " +
          "Judge only what the resume shows. Do not infer skills that are not evidenced.",
        messages: [
          {
            role: "user",
            content: `<rubric>\n${rubricPrompt(rubric)}\n</rubric>\n\n<resume file="${fileName}">\n${resumeText}\n</resume>\n\nSubmit your assessment.`,
          },
        ],
        tools: [SCORE_TOOL],
        tool_choice: { type: "tool", name: "submit_assessment" },
      });
    } catch (err) {
      // Rate limits and other API errors are not fixed by resampling (the SDK
      // already retried 429s with backoff), so we surface them immediately
      // rather than burning the remaining attempts.
      if (err instanceof Anthropic.RateLimitError) {
        logFailure(fileName, "RATE_LIMIT", {
          status: err.status ?? "?",
          message: JSON.stringify(err.message),
        });
        throw new Error(
          "Rate limit reached — too many resumes scored at once. Wait a minute, then use Retry Failed. " +
            "If this keeps happening, lower scoring concurrency or raise your Anthropic API tier."
        );
      }
      logFailure(fileName, "API_ERROR", {
        name: err instanceof Error ? err.name : typeof err,
        message: err instanceof Error ? JSON.stringify(err.message) : String(err),
      });
      throw err;
    }

    // A truncated response (hit max_tokens) returns partial tool JSON. That can
    // leave categoryScores incomplete-but-non-empty, which would slip past the
    // empty-array guard below and silently score the candidate on partial data.
    // Treat truncation as a retryable failure.
    if (response.stop_reason === "max_tokens") {
      logFailure(fileName, "TRUNCATED", {
        attempt,
        stop_reason: response.stop_reason,
        max_tokens: 3000,
        output_tokens: response.usage.output_tokens,
        input_tokens: response.usage.input_tokens,
      });
      if (attempt < MAX_SCORING_ATTEMPTS) {
        await sleep(250 * attempt);
        continue;
      }
      throw new Error("Retry scoring");
    }

    const raw = getToolInput<{
      candidateName: string;
      disqualified: boolean;
      disqualifierReason: string;
      categoryScores: { categoryId: string; score: number; evidence: string }[];
      redFlagsTriggered: { redFlagId: string; evidence: string }[];
      bonusesAwarded: { bonusId: string; evidence: string }[];
      summary: string;
    }>(response, "submit_assessment");

    // Normalize array fields before use: the model can return them as
    // JSON-encoded strings or omit them entirely (see asArray above).
    const rawCategoryScores = asArray<{
      categoryId: string;
      score: number;
      evidence: string;
    }>(raw.categoryScores);
    const rawRedFlags = asArray<{ redFlagId: string; evidence: string }>(
      raw.redFlagsTriggered
    );
    const rawBonuses = asArray<{ bonusId: string; evidence: string }>(
      raw.bonusesAwarded
    );

    // A non-disqualified candidate with zero parseable category scores means
    // the model returned off-schema output we couldn't recover. Resample rather
    // than defaulting every category to 1 and silently burying the candidate.
    if (!raw.disqualified && rawCategoryScores.length === 0) {
      logFailure(fileName, "OFF_SCHEMA", {
        attempt,
        stop_reason: response.stop_reason,
        output_tokens: response.usage.output_tokens,
        categoryScores_type: Array.isArray(raw.categoryScores)
          ? "array(empty)"
          : typeof raw.categoryScores,
        raw_categoryScores: JSON.stringify(raw.categoryScores)?.slice(0, 300),
      });
      if (attempt < MAX_SCORING_ATTEMPTS) {
        await sleep(250 * attempt);
        continue;
      }
      throw new Error("Retry scoring");
    }

    return buildScore(raw, rawCategoryScores, rawRedFlags, rawBonuses, fileName, rubric);
  }

  // Unreachable: the loop either returns a score or throws on the final attempt.
  throw new Error("Retry scoring");
}

// Joins a validated model assessment back to the rubric and computes the
// weighted score, deductions, bonuses, and band. Pure arithmetic — no model
// output is trusted for the math.
function buildScore(
  raw: {
    candidateName: string;
    disqualified: boolean;
    disqualifierReason: string;
    summary: string;
  },
  rawCategoryScores: { categoryId: string; score: number; evidence: string }[],
  rawRedFlags: { redFlagId: string; evidence: string }[],
  rawBonuses: { bonusId: string; evidence: string }[],
  fileName: string,
  rubric: Rubric
): CandidateScore {
  // Join model output back to the rubric; drop anything that doesn't match.
  const categoryScores = rubric.categories.map((cat) => {
    const found = rawCategoryScores.find((s) => s.categoryId === cat.id);
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      weight: cat.weight,
      score: found ? clamp(found.score, 1, 4) : 1,
      evidence: found?.evidence ?? "Not assessed by model; defaulted to 1.",
    };
  });

  const redFlagsTriggered = rawRedFlags.flatMap((t) => {
    const flag = rubric.redFlags.find((r) => r.id === t.redFlagId);
    return flag
      ? [{ text: flag.text, deduction: flag.deduction, evidence: t.evidence }]
      : [];
  });

  const bonusesAwarded = rawBonuses.flatMap((t) => {
    const bonus = rubric.bonusCriteria.find((b) => b.id === t.bonusId);
    return bonus
      ? [{ text: bonus.text, points: bonus.points, evidence: t.evidence }]
      : [];
  });

  const disqualified = raw.disqualified;
  const rawWeightedScore = disqualified
    ? 0
    : round2(
        categoryScores.reduce((sum, c) => sum + (c.score * c.weight) / 100, 0)
      );
  const deductions = redFlagsTriggered.reduce((s, r) => s + r.deduction, 0);
  const bonuses = bonusesAwarded.reduce((s, b) => s + b.points, 0);
  const finalScore = disqualified
    ? 0
    : round2(clamp(rawWeightedScore - deductions + bonuses, 0, 4));

  return {
    candidateName: raw.candidateName || fileName,
    fileName,
    disqualified,
    disqualifierReason: disqualified ? raw.disqualifierReason || null : null,
    categoryScores: disqualified ? [] : categoryScores,
    redFlagsTriggered,
    bonusesAwarded,
    rawWeightedScore,
    finalScore,
    band: bandFor(finalScore, disqualified),
    summary: raw.summary,
  };
}
