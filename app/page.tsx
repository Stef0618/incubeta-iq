import { auth, authEnabled, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Wizard from "@/components/Wizard";

export default async function Home() {
  let userEmail: string | null = null;
  if (authEnabled) {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    userEmail = session.user.email ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight">
              Recruit <span className="text-lime-300">IQ</span>
            </span>
            <span className="text-xs text-slate-400">
              Incubeta · internal use only
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            {userEmail ? (
              <>
                <span>{userEmail}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded border border-slate-600 px-3 py-1 text-xs hover:bg-slate-800"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <span className="text-xs text-amber-300">
                auth disabled (dev)
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Wizard />
      </main>
    </div>
  );
}
