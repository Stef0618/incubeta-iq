# Incubeta · Recruit IQ
**AI-powered candidate screening for the Incubeta HR team**
*Internal use only — not for client distribution*

---
## What It Does

Recruit IQ automates the first-stage resume triage process for any role Incubeta hires for. It reads a Job Description and a structured scoring model, builds a weighted evaluation rubric using AI, scores uploaded resumes against that rubric, and writes a ranked shortlist directly to Google Sheets — in minutes rather than days.

The target output is a ranked list of the top 25 candidates for any role, each with a score, a band (Advance / Consider / Borderline / Decline), per-category breakdowns, red flag annotations, and an AI-written evaluator summary.

---
## Quick Start

Get a local instance running in five steps.

1. **Clone the repo**
   ```bash
   git clone <your-fork-url> incubeta-iq && cd incubeta-iq
   ```
2. **Use a current Node toolchain.** The app targets Next.js 16 and needs **Node ≥ 20.15** (pdf-parse is pinned to 1.1.1 for this reason). If you use nvm, make sure it and your Node version are up to date:
   ```bash
   nvm install --lts && nvm use --lts
   node -v   # confirm ≥ 20.15
   ```
3. **Install dependencies**
   ```bash
   npm install
   ```
4. **Set up environment variables.** Copy the template and fill in the fields you need:
   ```bash
   cp .env.example .env.local
   ```
   At minimum, `ANTHROPIC_API_KEY` is required to generate rubrics and score resumes. The Google Sheets and OAuth blocks are optional for local dev (see [State of Security](#state-of-security) for what leaving them blank means).
5. **Run the dev server**
   ```bash
   npm run dev      # serves on http://localhost:3000
   ```

For a production build, use `npm run build` followed by `npm run start`.

---

## State of Security

Security here is governed entirely by which fields you fill in `.env.local`.

**User authentication — opt-in via OAuth.** Access control uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (`auth.ts`):
- **If filled in** → NextAuth + Google OAuth is active, and sign-in is scoped to `@incubeta.com` accounts only. The domain check is enforced server-side in the `signIn` callback, not just hinted to Google, so non-Incubeta accounts are rejected even if they reach the OAuth screen.
- **If left blank** → auth auto-disables and the app runs **open** on localhost. This is intended for local development only. Anyone who can reach the host can use it. **Do not deploy publicly without these keys set.**

If your team forks this, the domain restriction is a single constant (`ALLOWED_DOMAIN` in `auth.ts`) — change it to your own domain to scope access to your organization.

**Credentials stay server-side.** All Anthropic API keys and Google service account credentials are read only in server-side code (API routes and `lib/`) and are never exposed to the browser.

**No candidate data is persisted.** Resumes are parsed to plain text in-memory, scored, then discarded — nothing is written to disk or a database. Only the scored JSON output is retained in session state and pushed to Google Sheets on export. This is intentional for PII and GDPR hygiene; do not add a file store.

**Google Sheets uses a shared service account.** Export writes via a service account (not per-user OAuth), so access to the destination sheet is controlled at the Google Drive level by the Workspace admin sharing the sheet with the service account email. Google sheets functionality is automatically turned on when you fill in the relevant fields in `.env.local`.

---


## The Four-Step Workflow

```
Step 1          Step 2              Step 3              Step 4
Role Setup  →   Rubric Gen  →   Resume Scoring  →   Results + Export
                & Approval
```

**Step 1 — Role Setup**
Paste the Job Description (Tab 1 of the Incubeta JD doc) and the Scoring Criteria (Tab 2). Confirm the role title. Hit Generate Rubric.

**Step 2 — Rubric Generation & Approval**
Recruit-AI generates a weighted rubric based on:
- **Your initial inputs**: while these do not need to be detailed, they should address at a minimum the main categories of skills & capabilities for the desired role, and at least one or two evaluation criteria for each category, as well as the relative weighting given to each category.
    - NOTE: Your initial inputs should also list any red-flags and/or disqualifying factors and or bonus criteria for each role. Bonus criteria result in additional points awarded, red-flags result in demerit points, and disqualifiers result in candidate rejection.
- **Your AI-guided inputs**: Recruit-AI will ask up to twenty (20) targeted follow-up questions to identify specific evaluation criteria and their score within each category. In addition, Recruit-AI may suggest additional categories (and subsequent criteria) and/or bonus criteria, red-flags and/or disqualifiers to fill any gaps. 
- **Control**: As the HR specialist, you will have complete control to review and edit every field (categories & their weights; level descriptions, red flags (and their demerit value), bonus criteria (and their bonus value), and disqualifiers, before approving. Nothing is scored until you approve.

**Step 3 — Resume Upload & Scoring**
Drag and drop PDF or DOCX resume files — one or hundreds. The AI scores each candidate against your approved rubric, checking disqualifiers first, then applying weighted category scores, red flag deductions, and bonus points.
- NOTE: In future versions we will convert all files to Markdown format to economize on token usage, particularly when it comes to PDF submissions.

**Step 4 — Results & Export**
Candidates are ranked by score. Each row shows band, score, per-category breakdown, flags, and an expandable AI summary. Click Export to push the full dataset directly to a Google Sheets document in your Incubeta Workspace.

---

## Scoring Model

Recruit IQ uses a weighted ratio model on a 1–4 scale.

| Level | Label | Meaning |
|-------|-------|---------|
| 4 | Exceptional | Clearly exceeds requirements |
| 2.5 | Strong | Solidly meets requirements with evidence |
| 2 | Adequate | Partially meets requirements; gaps evident |
| 1 | Inadequate | Does not meet requirements |

**Score formula:**
```
Raw Weighted Score  =  Σ (category_score × category_weight ÷ 100)
Final Score         =  Raw Weighted Score − Red Flag Deductions + Bonus Points
```

**Score bands:**
```
ADVANCE      ≥ 3.0   →  Top 25 shortlist
CONSIDER     ≥ 2.5   →  Review if shortlist volume is low
BORDERLINE   ≥ 2.0   →  Hold — do not advance
DECLINE      < 2.0 or any DQ  →  Do not advance
```

Categories, weights, red flags, disqualifiers, and bonus criteria are all role-specific — defined in Tab 2 of each JD document and editable before each screening run.

---

## Tech Stack

### Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js + Tailwind CSS | Multi-step wizard UI, file upload, results view |
| Backend | Next.js API Routes | Resume parsing, AI calls, Google Sheets export |
| AI — Rubric Generation | Claude Opus (`claude-opus-4-5`) | Deep reasoning for rubric construction (Step 2) |
| AI — Resume Scoring | Claude Haiku (`claude-haiku-4-5-20251001`) | High-volume structured scoring (Step 3) |
| File Parsing | `pdf-parse` + `mammoth` | Extract text from PDF and DOCX resumes |
| Google Sheets | Google Sheets API v4 + service account | Write ranked shortlist to Incubeta Workspace |
| Authentication | NextAuth.js + Google OAuth | Restrict access to @incubeta.com accounts |
| Hosting | Vercel | Zero-config deployment for Next.js |

### Key Design Decisions

**Two-model AI strategy**
Rubric generation (Step 2) runs once per hiring round and requires nuanced reasoning — inferring category weights, writing level descriptors, identifying disqualifiers, and asking targeted clarifying questions. Claude Opus handles this. Resume scoring (Step 3) is a structured extraction task applied repeatedly against an already-defined rubric; Claude Haiku is fast, cost-effective, and fully capable here. Using Haiku for Step 3 reduces AI costs by roughly 10–20× compared to running Opus for every resume.

**Stateless resume processing**
Resumes are processed in-memory and never persisted to a database or file store. Each file is uploaded to the server, parsed to plain text, scored by the AI, and discarded. Only the scored output (JSON) is retained in the session and written to Google Sheets on export. This keeps the architecture simple and avoids accumulating candidate PII on the server — a meaningful benefit for GDPR and data hygiene.

**Service account for Google Sheets**
The app authenticates to Google Sheets via a service account shared with the Incubeta Workspace, rather than per-user OAuth. HR reps do not need to authorise the integration individually — the app simply writes to a pre-configured sheet. Access control is handled at the Google Drive level by the Workspace admin.

**Google OAuth for user auth**
Sign-in is restricted to @incubeta.com Google accounts via NextAuth.js. No user database is required.

### Infrastructure Notes

- Resumes are processed in-transit only. No file storage service (S3, GCS, etc.) is needed.
- All Claude API keys and Google service account credentials are stored as server-side environment variables and never exposed to the browser.
- If the server restarts mid-batch during a large resume upload, the scoring run will need to be restarted. For very large batches, consider adding client-side progress checkpointing.


## Important Files

All prompts sent to the Claude models live in `lib/ai/`. To change how the AI behaves, edit these two files: (nothing under `app/api/` or `components/` builds prompts.)

**`lib/ai/rubric.ts`** — Step 2 (Opus). Builds the clarifying-questions call and the rubric-generation call. Holds the system prompts, tool definitions, and user-message templates that tell Opus how to infer categories and weights, write level descriptors, and propose red flags, bonuses, and disqualifiers.

**`lib/ai/scoring.ts`** — Step 3 (Haiku). Scores one resume against the approved rubric. Holds the scoring system prompt, the `submit_assessment` tool schema (its field descriptions are also instructions), and the function that formats the rubric and resume into the user message. The weighted math, deductions, and banding are computed in this file server-side — never trusted to the model.

`lib/ai/client.ts` holds no prompt text — just the model IDs (`RUBRIC_MODEL`, `SCORING_MODEL`) and the helper that extracts tool output from a response.
