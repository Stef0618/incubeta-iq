import Anthropic from "@anthropic-ai/sdk";

// Server-side only. Never import this from a client component.

export const RUBRIC_MODEL = "claude-opus-4-8"; // deep reasoning, runs once per role
export const SCORING_MODEL = "claude-haiku-4-5-20251001"; // structured extraction, runs per resume

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before generating rubrics or scoring resumes."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Extract the forced tool-use input from a messages response.
 * All structured AI calls in this app force a single tool call so the
 * output is schema-constrained JSON rather than free text.
 */
export function getToolInput<T>(
  response: Anthropic.Message,
  toolName: string
): T {
  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
  if (!block) {
    throw new Error(`Model did not return expected ${toolName} output.`);
  }
  return block.input as T;
}
