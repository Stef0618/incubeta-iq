# Recruit IQ — Setup & Deployment Runbook

Complete, self-contained setup for an Incubeta-owned deployment. Every
credential below is provisioned and owned by Incubeta; there is no dependency on
the original developer's machine, accounts, or cloud project. All configuration
is supplied through environment variables — **no code changes are required**.

You will need: a Google Cloud project (in Incubeta's org), Google Workspace
**super admin** access, an Anthropic account, and a host for the app (Vercel
assumed below; any Node host works — only the env-var UI differs).

> **What ships today vs. what is optional.** The app as shipped restricts access
> to any `@incubeta.com` Google account — that is the tested, working gate.
> Steps 5 and 6, the Workspace group (`WORKSPACE_GROUP_EMAIL`) and
> `WORKSPACE_ADMIN_SUBJECT`, are **optional** and add a finer gate that limits
> access to a specific group (HR + managers). That group path is implemented but
> **has not been verified end to end** by the original developer (no Workspace
> domain was available to test it). It activates automatically once those two
> env vars are set. If you enable it, validate it with the verifier in step 10
> before relying on it. Skip steps 5 and 6 to ship the domain-only gate.

---

## Two "client IDs" — don't mix them up

This setup involves two unrelated identifiers both called a "client ID":

- **Service account client ID** — a long numeric value, used only in step 6
  (domain-wide delegation). It is NOT an env var.
- **OAuth client ID** (`GOOGLE_CLIENT_ID`) — used for user sign-in, created in
  step 7. This one IS an env var.

They are different objects from different parts of the setup. Keep them separate.

---

## 1. Anthropic API key

Create a key at console.anthropic.com. This becomes `ANTHROPIC_API_KEY`. The app
uses Opus for rubric generation and Haiku for scoring; make sure the org's rate
tier is high enough for batch scoring (see the rate-limit notes in the repo).

## 2. Google Cloud project + APIs

In a Google Cloud project owned by Incubeta, enable both:
- **Google Sheets API** (for export)
- **Admin SDK API** (for the group-membership access check)

## 3. Service account + key

Create one service account (it serves both Sheets export and the auth group
check). Create a **JSON key** and keep it secret. From the JSON you need:
- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key`  → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `client_id`    → the numeric ID used in step 6 (not an env var)

> **Private key formatting:** in `.env`/host env vars, paste the `private_key`
> value on one line with its `\n` sequences left intact, wrapped in double
> quotes. The app converts `\n` back to real newlines at runtime. Mangled
> newlines are the most common cause of a broken deploy.

## 4. Google Sheet

Create the destination spreadsheet in Incubeta's Workspace. Share it with the
service account's `client_email` as **Editor** (this is how the SA gets write
access — no DWD needed for Sheets). The ID is in the sheet URL
(`https://docs.google.com/spreadsheets/d/<ID>/edit`) is `GOOGLE_SHEETS_ID`.

## 5. Workspace access group (OPTIONAL — finer gate, untested)

Confirm (or create) the group that defines who may use the tool, e.g.
`recruit-iq-users@incubeta.com` (in **admin.google.com → Directory → Groups**,
or groups.google.com), and add the HR reps and managers. This group is the
entire allowlist — granting/revoking access later is just group membership, no
redeploy.
- Group address → `WORKSPACE_GROUP_EMAIL`
- Pick an admin account holding at least the **Groups Reader** admin role for
  the app to impersonate when reading membership. Fill the env var with just
  that user's email address → `WORKSPACE_ADMIN_SUBJECT`

> **Why:** A Workspace group is a listserv that doubles as an access list.
> Other systems can ask "is this person in the group?" to make permission
> decisions. The app *impersonates* an admin
> because the service account is an outsider to the directory, and reading group
> membership is a privileged action only an admin-level user may perform. The
> app borrows that admin's identity for this one read-only lookup and nothing
> else.

## 6. Domain-wide delegation (OPTIONAL — only if doing step 5; requires super admin)

In **admin.google.com → Security → Access and data control → API controls →
Domain-wide delegation → Add new**:
- **Client ID:** the service account's numeric `client_id` from step 3.
- **OAuth scope** (exactly this, read-only):
  ```
  https://www.googleapis.com/auth/admin.directory.group.member.readonly
  ```

This authorizes the SA to read group membership in Incubeta's domain.

> **Why:** A *super admin* is the top-level administrator of the Workspace org
> (manages users, security, billing). Only a super admin can authorize
> delegation, because handing any outside identity access into the org is
> sensitive. But what gets handed over is tiny: the **scope** is a single
> read-only keyhole (group membership), not admin power. The app cannot create
> users, read mail, or change settings — only check group membership.
>
> **Note:** the OAuth scope string looks like a URL but is *not* a web page —
> it is an identifier for one permission. Paste it into the "OAuth scope"
> field of the delegation form.

## 7. OAuth app for user sign-in

In the same Google Cloud project:
- Configure the **OAuth consent screen** as **Internal** (limits sign-in to the
  Workspace org — a useful outer wall under the group gate).
- Create an **OAuth client ID** of type **Web application**:
  - Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`
  - Authorized JavaScript origin: `https://<your-domain>`
- Result → `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The redirect URI must exactly match the deployed domain (`NEXTAUTH_URL`), or
sign-in fails.

> **Why:** `<your-domain>` is the URL where the app is actually served — the
> Vercel URL (e.g. `recruit-iq.vercel.app`) or a custom domain mapped to it
> (e.g. `recruit.incubeta.com`). After Google authenticates a user it sends them
> back to `https://<that-domain>/api/auth/callback/google`; if the domain
> registered here does not match where the app lives, Google refuses the
> redirect and sign-in breaks. Whatever you use, it must equal `NEXTAUTH_URL`.

## 8. NextAuth secret

Generate a random secret (`openssl rand -base64 32`) → `NEXTAUTH_SECRET`.

> **Why:** When someone logs in, the app gives their browser a session token (a
> cookie) proving they are authenticated. This secret is the key the app uses to
> cryptographically sign that token, so the server can verify it issued the
> token and nobody forged it. Like a wax-seal stamp only the server owns. It
> must be random, kept secret, and identical across all server instances (or
> tokens signed by one instance fail to validate on another).

---

## Environment variables (complete list)

| Variable | From step |
|----------|-----------|
| `ANTHROPIC_API_KEY` | 1 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 3 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | 3 |
| `GOOGLE_SHEETS_ID` | 4 |
| `WORKSPACE_GROUP_EMAIL` | 5 (optional) |
| `WORKSPACE_ADMIN_SUBJECT` | 5 (optional) |
| `GOOGLE_CLIENT_ID` | 7 |
| `GOOGLE_CLIENT_SECRET` | 7 |
| `NEXTAUTH_SECRET` | 8 |
| `NEXTAUTH_URL` | the deployed production URL |

> **Group gate behavior:** the optional group check is *off* until both
> `WORKSPACE_GROUP_EMAIL` and `WORKSPACE_ADMIN_SUBJECT` are set — until then any
> `@incubeta.com` account is allowed (the shipped, tested default). Once both are
> set, the group check turns on and fails closed: a member is allowed, a
> non-member is denied, and any lookup error denies rather than falling back to
> domain-only. Validate it with the verifier (step 10) before relying on it.

---

## 9. Deploy

On Incubeta's host (e.g. their own Vercel project): set every variable above for
the Production environment, set `NEXTAUTH_URL` to the production domain, and
deploy. Env-var changes only take effect on a fresh deployment.

## 10. Verify

1. **Group check, without the login flow** — from the project root:
   ```
   node --env-file=.env.local scripts/verify-group-access.mjs someone@incubeta.com
   ```
   Expect `isMember=true` for a group member, `false` for a non-member. A
   `FAILED (...)` line names the exact step to revisit.
2. **Sign-in** — confirm a group member can log in and a non-member (still
   `@incubeta.com`) is rejected.
3. **Export** — run a small resume batch and confirm a new tab appears in the
   sheet.
