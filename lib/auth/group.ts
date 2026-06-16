import { google } from "googleapis";

// Workspace-group access gate.
//
// A signed-in @incubeta.com user is allowed only if they belong to the
// configured Google Workspace group. That group IS the allowlist — owned and
// maintained by Incubeta's Workspace admin in the Admin console, never in this
// codebase. Adding/removing a user is a group-membership change on their side;
// no code change or redeploy here.
//
// Mechanism: Admin SDK Directory API `members.hasMember`. The service account
// (the same one used for the Sheets export) must be granted domain-wide
// delegation by a Workspace super admin for the read-only scope below, and
// impersonates an admin user (WORKSPACE_ADMIN_SUBJECT) that holds at least the
// "Groups Reader" admin role.

const MEMBER_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.group.member.readonly";

const GROUP = process.env.WORKSPACE_GROUP_EMAIL;
const SUBJECT = process.env.WORKSPACE_ADMIN_SUBJECT;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// True only when every piece needed to perform the check is present. When false
// the caller must fail closed (deny), never fall back to domain-only access.
export const groupCheckConfigured = Boolean(
  GROUP && SUBJECT && SA_EMAIL && SA_KEY
);

function directory() {
  const auth = new google.auth.JWT({
    email: SA_EMAIL,
    key: SA_KEY!.replace(/\\n/g, "\n"),
    scopes: [MEMBER_SCOPE],
    subject: SUBJECT, // impersonate an admin — required to read group membership
  });
  return google.admin({ version: "directory_v1", auth });
}

// Sign-in is infrequent, but serverless instances are reused across requests,
// so a short TTL cache spares repeat Directory API calls for the same user.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { allowed: boolean; at: number }>();

/**
 * Returns true iff `email` is a member of the configured Workspace group.
 * Throws on API/config failure — the caller decides how to fail (closed).
 */
export async function isGroupMember(email: string): Promise<boolean> {
  const key = email.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.allowed;

  const res = await directory().members.hasMember({
    groupKey: GROUP!,
    memberKey: key,
  });
  const allowed = res.data.isMember === true;
  cache.set(key, { allowed, at: Date.now() });
  return allowed;
}
