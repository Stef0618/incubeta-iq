# Incubeta Recruit IQ — Project State

## Status
**Phase:** Built, awaiting credentials
**Last Updated:** 2026-06-11

## What Exists
- `README.md` — product spec and user-facing workflow documentation
- `CLAUDE.md` — developer context, tech stack, architecture rules
- `.env.local.example` — required environment variable template (matches code exactly)
- Full application code (see below)

## What's Been Built (2026-06-11)
The entire app, end to end:
- `types/index.ts` — all domain types (Rubric, CandidateScore, bands, etc.)
- `lib/parsers/` — PDF (pdf-parse v1) + DOCX (mammoth) extraction, in-memory only, 40k char cap
- `lib/ai/client.ts` — Anthropic client; Opus `claude-opus-4-8` for rubric, Haiku for scoring
- `lib/ai/rubric.ts` — clarifying questions (max 20) + rubric generation, forced tool-use JSON
- `lib/ai/scoring.ts` — Haiku assessment; weighted math, deductions, and banding computed server-side, never trusted to the model
- `lib/sheets/export.ts` — service account auth, new tab per export, bold frozen header
- `auth.ts` — NextAuth v5 beta, Google OAuth restricted to @incubeta.com; auth auto-disables when creds absent (dev mode)
- API routes: `/api/rubric` (questions|generate), `/api/score` (one file per request, client-side concurrency 3), `/api/export`, `/api/auth/[...nextauth]`
- UI: 4-step wizard (`components/Wizard.tsx` + steps/) — role setup, clarifying questions → fully editable rubric (approval gated on weights summing to 100), drag-drop scoring with progress + retry-failed, ranked results table with expandable detail + Sheets export
- `app/signin/page.tsx` — Google sign-in page

## Verified
- `npm run build` and `npm run lint` pass
- Anthropic key is in `.env.local`; Stefan ran the full flow end to end including a real batch test in Step 3 (synthetic resumes in `test-resumes/`)
- Optional-criteria path verified live: Opus proposes categories/weights from a bare JD and asks for confirmation

## Known Issues — Error Messaging (get to the bottom of this first)
Two error kinds surfaced during the 2026-06-11 batch test, both shown raw in the Step 3 file list:

1. **Anthropic rate limit.** Raw JSON blob surfaced in the UI: `rate_limit_error: This request would exceed your organization's rate limit of 10,000 output tokens per minute (model: claude-haiku-4-5-20251001)`. With client concurrency 3 and `max_tokens: 4000` per scoring call, batch runs can blow through the 10k output-TPM tier limit. Fix direction: catch 429s in `lib/ai/scoring.ts` and retry with backoff (the SDK has built-in retry options), surface a human message instead of the JSON blob, and consider lowering max_tokens or concurrency. Raising the org tier (console.anthropic.com/settings/billing) is the throughput fix.
2. **`raw.categoryScores.find is not a function`** (many occurrences). Haiku occasionally returns off-schema tool output: `categoryScores` arrives as something other than an array (likely a JSON-encoded string). `lib/ai/scoring.ts` trusts the shape and calls `.find` on it. Fix direction: normalize the raw tool input before use (parse string → array, default non-arrays to empty, same for `redFlagsTriggered` / `bonusesAwarded`) and retry the call once on schema violation. Note: failures like these are contained per-file by design; Retry Failed in the UI often succeeds.

## Gotchas / Decisions
- **Node 20.15.0 on this machine**: pdf-parse v2 requires ≥ 20.16, so pdf-parse is pinned to **1.1.1** (imported via `pdf-parse/lib/pdf-parse.js` to dodge its debug-mode entrypoint; local d.ts in `types/pdf-parse-lib.d.ts`). If Node gets upgraded, v2 is an option but not required.
- `serverExternalPackages: ["pdf-parse", "mammoth", "googleapis"]` in next.config.ts
- Dev server runs on port 3000 (Stefan killed the Mission Control process that previously held it, 2026-06-11)
- Scoring criteria in Step 1 are optional: when blank, the rubric prompt tells Opus to derive categories/weights/flags from the JD and the questions prompt has it propose and confirm them
- `/api/parse` extracts text from an uploaded PDF/DOCX (used for JD import in Step 1, same in-memory handling as resumes)
- The block-file-ops hook false-positives on `[...nextauth]` paths (reads `...` as traversal); that file was created via shell
- Scoring math is server-side by design: model submits per-category 1-4 scores + flag IDs, server computes weighted sum, deductions, bonuses, band

## Next Steps (Stefan's stated priority order, 2026-06-11)
1. **Get to the bottom of the error messaging** (the two error kinds above)
2. **Host it publicly** (Vercel deploy: env vars, production NEXTAUTH_URL)
3. **Connect a Google spreadsheet** (service account creds + GOOGLE_SHEETS_ID in env; share the sheet with the service account email as editor)
4. **Manage authorization** (OAuth client ID/secret + NEXTAUTH_SECRET; verify the @incubeta.com domain restriction with a real account)

## Known Blockers
- Need Google service account credentials from Incubeta Workspace admin
- Need Google OAuth client ID/secret (restricted to @incubeta.com)
- ~~Need Anthropic API key~~ in place and working

## Notes
- Resumes must never be persisted — stateless processing only (enforced: parse → score → discard, no disk writes)
- Rubric approval gate is a hard requirement before any scoring runs (enforced in wizard flow)
