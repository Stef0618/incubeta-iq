import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { groupCheckConfigured, isGroupMember } from "@/lib/auth/group";

// SHIPPED CONFIG: access requires an @incubeta.com Google account. That is the
// gate in production today, and it is the only auth path that has been tested.
//
// OPTIONAL, UNTESTED: a finer gate that further restricts access to members of a
// Workspace group (HR + managers) is implemented in lib/auth/group.ts but is NOT
// active by default. It turns on automatically only when the Workspace env vars
// are set (WORKSPACE_GROUP_EMAIL + WORKSPACE_ADMIN_SUBJECT, plus the service
// account creds and domain-wide delegation). It has not been verified end to end
// — to enable and validate it, follow docs/incubeta-admin-setup.md and run
// scripts/verify-group-access.mjs.
//
// When OAuth credentials are absent (local dev before keys arrive), auth is
// disabled and the app runs open on localhost.

export const authEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

const ALLOWED_DOMAIN = "incubeta.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    (authEnabled ? undefined : "insecure-dev-secret-auth-disabled"),
  trustHost: true,
  providers: authEnabled
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          // hd hints Google to show only Workspace accounts; the signIn
          // callback below is the actual enforcement.
          authorization: { params: { hd: ALLOWED_DOMAIN } },
        }),
      ]
    : [],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase() ?? "";
      // Primary, tested gate: must be an @incubeta.com account.
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;
      // Optional group gate. Off unless the Workspace env vars are set, in which
      // case this is the only line that changes the shipped behavior. Domain
      // accounts are allowed through when it is off (the shipped default).
      if (!groupCheckConfigured) return true;
      try {
        return await isGroupMember(email);
      } catch (err) {
        // Once the group gate is intentionally enabled, fail closed on error.
        console.error("[auth] group membership check failed:", err);
        return false;
      }
    },
  },
  pages: {
    signIn: "/signin",
  },
});

/**
 * Guard for API routes. Returns null when the request is allowed,
 * or a 401 message when it is not.
 */
export async function requireSession(): Promise<string | null> {
  if (!authEnabled) return null;
  const session = await auth();
  return session?.user ? null : "Not authenticated";
}
