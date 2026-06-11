import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Access is restricted to @incubeta.com Google accounts. When OAuth
// credentials are absent (local dev before keys arrive), auth is disabled
// and the app runs open on localhost.

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
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase() ?? "";
      return email.endsWith(`@${ALLOWED_DOMAIN}`);
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
