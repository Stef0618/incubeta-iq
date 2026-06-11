# Incubeta Recruit IQ — CLAUDE.md

AI-powered resume screening tool for Incubeta's HR team. Internal use only.

---

## What This Is

A Next.js web app that automates first-stage candidate triage. HR uploads a JD and scoring criteria, the app generates a weighted rubric via AI (with HR approval), then scores uploaded resumes and exports a ranked shortlist to Google Sheets.

Four steps: Role Setup → Rubric Generation & Approval → Resume Upload & Scoring → Results & Export.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend | Next.js API Routes |
| AI — Rubric Gen | Claude Opus (`claude-opus-4-8`) — runs once per role |
| AI — Resume Scoring | Claude Haiku (`claude-haiku-4-5-20251001`) — runs per resume |
| File Parsing | `pdf-parse` (PDF) + `mammoth` (DOCX) |
| Google Sheets | Google Sheets API v4, service account auth |
| User Auth | NextAuth.js + Google OAuth (restricted to @incubeta.com) |
| Hosting | Vercel |

---

## Project Structure

```
incubeta-iq/
├── app/
│   ├── api/
│   │   ├── rubric/          # Step 2: rubric generation endpoint
│   │   ├── score/           # Step 3: resume scoring endpoint
│   │   └── export/          # Step 4: Google Sheets export
│   ├── (auth)/              # NextAuth sign-in pages
│   └── page.tsx             # Main wizard UI
├── components/              # UI components (wizard steps, results table)
├── lib/
│   ├── ai/                  # Claude API wrappers (rubric.ts, scoring.ts)
│   ├── parsers/             # PDF and DOCX extraction
│   └── sheets/              # Google Sheets API client
├── types/                   # Shared TypeScript types (Rubric, Candidate, Score)
└── .env.local               # See env vars section below
```

---

## Environment Variables

```
# Anthropic
ANTHROPIC_API_KEY=

# Google Sheets (service account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_SHEETS_ID=

# Google OAuth (NextAuth)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

---

## Dev Commands

```bash
npm install
npm run dev       # localhost:3000
npm run build
npm run lint
```

---

## Key Architecture Rules

**Resumes are never persisted.** Files are parsed to plain text in-memory, scored, then discarded. Only the scored JSON output is retained in session state. Do not add file storage (S3, GCS, etc.) unless explicitly asked — this is intentional for GDPR/PII hygiene.

**Two-model strategy is intentional.** Rubric generation uses Opus (runs once, needs deep reasoning). Resume scoring uses Haiku (runs per-resume, structured extraction only). Do not swap models without a good reason — the cost difference is ~10-20x.

**Nothing is scored before rubric approval.** The Step 2 → Step 3 gate is a hard requirement. HR must review and approve the rubric before any resume is processed.

**Service account for Sheets, OAuth for users.** The app writes to Google Sheets via a shared service account — HR reps do not individually authorize it. User authentication is handled separately via NextAuth + Google OAuth, restricted to @incubeta.com accounts.

---

## Scoring Model

Weighted ratio model on a 1–4 scale per category.

```
Final Score = Σ(category_score × category_weight / 100) − red_flag_deductions + bonus_points
```

Bands: ADVANCE ≥ 3.0 / CONSIDER ≥ 2.5 / BORDERLINE ≥ 2.0 / DECLINE < 2.0 or any disqualifier.

Disqualifiers are checked first — a disqualified candidate is not scored further.

---

## What Not to Do

- Do not store resume files or raw text beyond the active request lifecycle.
- Do not expose API keys or service account credentials to the browser — all AI and Sheets calls are server-side only.
- Do not use Opus for resume scoring. That's Haiku's job.
- Do not skip the rubric approval gate in the workflow.
