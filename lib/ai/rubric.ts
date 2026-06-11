import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getToolInput, RUBRIC_MODEL } from "./client";
import type { ClarifyingQuestion, QuestionAnswer, Rubric } from "@/types";

// Step 2: rubric generation. Runs on Opus, once per role.

interface RoleInputs {
  roleTitle: string;
  jobDescription: string;
  scoringCriteria: string;
}

const QUESTIONS_TOOL: Anthropic.Tool = {
  name: "submit_questions",
  description:
    "Submit targeted clarifying questions for the HR specialist about the role's evaluation criteria.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description:
                "The skill category or rubric area this question targets",
            },
            question: { type: "string" },
          },
          required: ["topic", "question"],
        },
      },
    },
    required: ["questions"],
  },
};

const RUBRIC_TOOL: Anthropic.Tool = {
  name: "submit_rubric",
  description: "Submit the complete weighted evaluation rubric.",
  input_schema: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            weight: {
              type: "number",
              description:
                "Percentage weight. All category weights must sum to exactly 100.",
            },
            criteria: {
              type: "array",
              items: { type: "string" },
              description: "Specific evaluation criteria within this category",
            },
            levels: {
              type: "array",
              description:
                "Exactly four level descriptors, scores 4 (Exceptional), 3 (Strong), 2 (Adequate), 1 (Inadequate), each describing what evidence at that level looks like for this category.",
              items: {
                type: "object",
                properties: {
                  score: { type: "number", enum: [4, 3, 2, 1] },
                  label: {
                    type: "string",
                    enum: ["Exceptional", "Strong", "Adequate", "Inadequate"],
                  },
                  description: { type: "string" },
                },
                required: ["score", "label", "description"],
              },
            },
          },
          required: ["name", "weight", "criteria", "levels"],
        },
      },
      redFlags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            deduction: {
              type: "number",
              description:
                "Demerit points subtracted from the weighted score, typically 0.1 to 0.5",
            },
          },
          required: ["text", "deduction"],
        },
      },
      bonusCriteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            points: {
              type: "number",
              description: "Bonus points added, typically 0.1 to 0.3",
            },
          },
          required: ["text", "points"],
        },
      },
      disqualifiers: {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    },
    required: ["categories", "redFlags", "bonusCriteria", "disqualifiers"],
  },
};

function roleContext({ roleTitle, jobDescription, scoringCriteria }: RoleInputs): string {
  return [
    `<role_title>${roleTitle}</role_title>`,
    `<job_description>\n${jobDescription}\n</job_description>`,
    scoringCriteria.trim()
      ? `<scoring_criteria>\n${scoringCriteria}\n</scoring_criteria>`
      : "<scoring_criteria>None provided. Derive categories, weights, red flags, disqualifiers, and bonus criteria from the job description.</scoring_criteria>",
  ].join("\n\n");
}

export async function generateQuestions(
  inputs: RoleInputs
): Promise<ClarifyingQuestion[]> {
  const response = await getAnthropic().messages.create({
    model: RUBRIC_MODEL,
    max_tokens: 4000,
    system:
      "You are Recruit IQ, an expert HR screening assistant for Incubeta, a digital marketing agency. " +
      "You are preparing to build a weighted evaluation rubric for a role. " +
      "Before building it, ask the HR specialist targeted follow-up questions that resolve genuine ambiguity in their inputs: " +
      "missing weights, vague criteria, unstated red flags or disqualifiers, gaps where you would suggest an additional category or bonus criterion. " +
      "When no scoring criteria were provided, your questions are the main chance to establish the categories, their weights, red flags, disqualifiers, and bonus criteria; propose what you inferred from the job description and ask the specialist to confirm or correct it. " +
      "Ask only questions whose answers would change the rubric. Fewer, sharper questions are better. Never exceed 20.",
    messages: [
      {
        role: "user",
        content:
          roleContext(inputs) +
          "\n\nReview these inputs and submit your clarifying questions.",
      },
    ],
    tools: [QUESTIONS_TOOL],
    tool_choice: { type: "tool", name: "submit_questions" },
  });

  const { questions } = getToolInput<{
    questions: { topic: string; question: string }[];
  }>(response, "submit_questions");

  return questions.slice(0, 20).map((q, i) => ({
    id: `q${i + 1}`,
    topic: q.topic,
    question: q.question,
  }));
}

export async function generateRubric(
  inputs: RoleInputs,
  answers: QuestionAnswer[]
): Promise<Rubric> {
  const answeredBlock = answers
    .filter((a) => a.answer.trim())
    .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");

  const response = await getAnthropic().messages.create({
    model: RUBRIC_MODEL,
    max_tokens: 16000,
    system:
      "You are Recruit IQ, an expert HR screening assistant for Incubeta. " +
      "Build a complete weighted evaluation rubric for first-stage resume triage. " +
      "Ground every category, criterion, red flag, bonus, and disqualifier in the job description, the scoring criteria, and the HR specialist's answers. " +
      "Where their inputs left gaps, fill them with well-reasoned defaults appropriate to the role. " +
      "Category weights must sum to exactly 100. Level descriptions must be concrete enough that a scorer reading only a resume can apply them consistently. " +
      "Remember this rubric is applied to resumes only, not interviews: every criterion must be assessable from a resume.",
    messages: [
      {
        role: "user",
        content:
          roleContext(inputs) +
          (answeredBlock
            ? `\n\n<hr_specialist_answers>\n${answeredBlock}\n</hr_specialist_answers>`
            : "\n\nThe HR specialist skipped the clarifying questions. Use well-reasoned defaults.") +
          "\n\nSubmit the complete rubric.",
      },
    ],
    tools: [RUBRIC_TOOL],
    tool_choice: { type: "tool", name: "submit_rubric" },
  });

  const raw = getToolInput<{
    categories: {
      name: string;
      weight: number;
      criteria: string[];
      levels: { score: number; label: string; description: string }[];
    }[];
    redFlags: { text: string; deduction: number }[];
    bonusCriteria: { text: string; points: number }[];
    disqualifiers: { text: string }[];
  }>(response, "submit_rubric");

  return {
    roleTitle: inputs.roleTitle,
    categories: raw.categories.map((c, i) => ({
      id: `cat${i + 1}`,
      name: c.name,
      weight: c.weight,
      criteria: c.criteria.map((text, j) => ({ id: `cat${i + 1}-cr${j + 1}`, text })),
      levels: [...c.levels].sort((a, b) => b.score - a.score),
    })),
    redFlags: raw.redFlags.map((r, i) => ({ id: `rf${i + 1}`, ...r })),
    bonusCriteria: raw.bonusCriteria.map((b, i) => ({ id: `bn${i + 1}`, ...b })),
    disqualifiers: raw.disqualifiers.map((d, i) => ({ id: `dq${i + 1}`, ...d })),
  };
}
