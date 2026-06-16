# Incubeta Recruit IQ — Project State

## Status
**Phase:** Built, awaiting credentials
**Last Updated:** 2026-06-15

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

## Resolved — Step 3 Scoring Errors (2026-06-15)
Both error kinds from the 2026-06-11 batch test are fixed. All changes are in `lib/ai/scoring.ts` (plus one in `lib/ai/client.ts`). `tsc` + `lint` pass; Stefan ran two clean batch tests with zero manual retries.

1. **`raw.categoryScores.find is not a function`** (off-schema output) — **FIXED.**
   - **Diagnosis (confirmed via terminal logging, not assumed):** Haiku intermittently returns `categoryScores` as a *JSON-encoded string* rather than an array. The outer tool-call JSON parses fine, but the inner string has botched quote-escaping (single- instead of double-escaped), so `JSON.parse` on it fails. Truncation was ruled out: real responses run ~1.1–1.5k output tokens, well under the cap, `stop_reason=tool_use`. Failures are stochastic (temperature was at the 1.0 default), which is why repeated retries eventually clear them.
   - **Fix:** (a) `asArray()` helper normalizes the three array fields (`categoryScores`, `redFlagsTriggered`, `bonusesAwarded`) — parses string→array, defaults non-arrays/unparseable to `[]`. Valid-string cases are now recovered silently. (b) A non-disqualified candidate with zero parseable category scores is treated as a hard failure (throws "Retry scoring") instead of silently defaulting every category to 1 and burying the candidate. (c) **Internal retry loop** in `scoreResume` (`MAX_SCORING_ATTEMPTS = 5`, small increasing backoff) resamples on off-schema *or* truncation before surfacing a failure — moves the retries off the HR user's finger onto the server. (d) Scoring math extracted into `buildScore()` (unchanged arithmetic). (e) `temperature: 0.5` on the scoring call — cuts the off-schema rate and improves score reproducibility while keeping enough variance that the retry loop can draw a clean response. **Do not set temperature to 0** — that would make off-schema responses reproduce on every retry and defeat the loop.

2. **Anthropic rate limit (429)** — **FIXED.**
   - **Diagnosis:** With client concurrency 3 and `max_tokens: 4000`, the rate limiter's upfront reservation (3 × 4000 = 12k) exceeded the 10k output-TPM tier ceiling. Intermittent because actual responses are far smaller than max_tokens; only trips when calls cluster in one 60s window.
   - **Fix:** (a) `maxRetries: 4` on the Anthropic client (`client.ts`) — SDK retries 429s with backoff, honoring Retry-After. (b) `max_tokens` lowered 4000→3000, which puts the worst-case reservation at 3 × 3000 = 9k, under the limit, while leaving ample headroom over the ~1.5k responses actually produce (truncation is now also guarded explicitly). (c) Surviving 429s are caught as `Anthropic.RateLimitError` and rethrown as a plain-English message instead of the raw JSON blob. Note: raising the org tier (console.anthropic.com/settings/billing) is still the real throughput ceiling.

- **`SCORE_DEBUG` env var:** set to `1` to print `[SCORE-FAIL]` one-line failure diagnostics (truncation vs off-schema vs rate-limit, with token counts) to the server log. Off by default. Used to diagnose the above; left in place gated behind the flag.

## Gotchas / Decisions
- **Node 20.15.0 on this machine**: pdf-parse v2 requires ≥ 20.16, so pdf-parse is pinned to **1.1.1** (imported via `pdf-parse/lib/pdf-parse.js` to dodge its debug-mode entrypoint; local d.ts in `types/pdf-parse-lib.d.ts`). If Node gets upgraded, v2 is an option but not required.
- `serverExternalPackages: ["pdf-parse", "mammoth", "googleapis"]` in next.config.ts
- Dev server runs on port 3000 (Stefan killed the Mission Control process that previously held it, 2026-06-11)
- Scoring criteria in Step 1 are optional: when blank, the rubric prompt tells Opus to derive categories/weights/flags from the JD and the questions prompt has it propose and confirm them
- `/api/parse` extracts text from an uploaded PDF/DOCX (used for JD import in Step 1, same in-memory handling as resumes)
- The block-file-ops hook false-positives on `[...nextauth]` paths (reads `...` as traversal); that file was created via shell
- Scoring math is server-side by design: model submits per-category 1-4 scores + flag IDs, server computes weighted sum, deductions, bonuses, band

## Next Steps (Stefan's stated priority order)
1. ~~**Get to the bottom of the error messaging**~~ — DONE 2026-06-15 (see Resolved section above)
2. ~~**Host it publicly**~~ — DONE 2026-06-15 (deployed to Vercel)
3. **Connect a Google spreadsheet** (service account creds + GOOGLE_SHEETS_ID in env; share the sheet with the service account email as editor) — IN PROGRESS
4. **Manage authorization** — SHIPPING domain-only (@incubeta.com), the only tested path. Decision 2026-06-15: a passkey idea was considered and rejected (shared secret leaks, looks amateur, weaker than domain/group gates). The finer **group check is built but OFF by default and untested** (Stefan has no Workspace domain to test against). `lib/auth/group.ts` checks membership via Admin SDK Directory API (`members.hasMember`) with domain-wide delegation + admin impersonation; `auth.ts` signIn does domain-only unless `WORKSPACE_GROUP_EMAIL` + `WORKSPACE_ADMIN_SUBJECT` are set, in which case the group gate auto-activates and fails closed. Verifier: `scripts/verify-group-access.mjs`. Setup (group steps 5/6 marked OPTIONAL + untested): `docs/incubeta-admin-setup.md`. tsc + lint pass. Group path stays dormant in the repo so Incubeta can enable + validate it later by following the runbook.

## Known Blockers
- Need Google service account credentials from Incubeta Workspace admin
- Need Google OAuth client ID/secret (restricted to @incubeta.com)
- ~~Need Anthropic API key~~ in place and working

## Notes
- Resumes must never be persisted — stateless processing only (enforced: parse → score → discard, no disk writes)
- Rubric approval gate is a hard requirement before any scoring runs (enforced in wizard flow)
