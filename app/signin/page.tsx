import { authEnabled, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default function SignIn() {
  if (!authEnabled) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Recruit <span className="text-lime-500">IQ</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          AI-powered candidate screening for the Incubeta HR team. Sign in
          with your @incubeta.com Google account.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
