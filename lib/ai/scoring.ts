import type Anthropic from "@anthropic-ai/sdk";
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

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export async function scoreResume(
  resumeText: string,
  fileName: string,
  rubric: Rubric
): Promise<CandidateScore> {
  const response = await getAnthropic().messages.create({
    model: SCORING_MODEL,
    max_tokens: 4000,
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

  const raw = getToolInput<{
    candidateName: string;
    disqualified: boolean;
    disqualifierReason: string;
    categoryScores: { categoryId: string; score: number; evidence: string }[];
    redFlagsTriggered: { redFlagId: string; evidence: string }[];
    bonusesAwarded: { bonusId: string; evidence: string }[];
    summary: string;
  }>(response, "submit_assessment");

  // Join model output back to the rubric; drop anything that doesn't match.
  const categoryScores = rubric.categories.map((cat) => {
    const found = raw.categoryScores.find((s) => s.categoryId === cat.id);
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      weight: cat.weight,
      score: found ? clamp(found.score, 1, 4) : 1,
      evidence: found?.evidence ?? "Not assessed by model; defaulted to 1.",
    };
  });

  const redFlagsTriggered = raw.redFlagsTriggered.flatMap((t) => {
    const flag = rubric.redFlags.find((r) => r.id === t.redFlagId);
    return flag
      ? [{ text: flag.text, deduction: flag.deduction, evidence: t.evidence }]
      : [];
  });

  const bonusesAwarded = raw.bonusesAwarded.flatMap((t) => {
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
