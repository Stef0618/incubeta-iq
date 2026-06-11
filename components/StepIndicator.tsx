const STEPS = [
  "Role Setup",
  "Rubric & Approval",
  "Resume Scoring",
  "Results & Export",
];

export default function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state =
          n < current ? "done" : n === current ? "active" : "upcoming";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                (state === "done"
                  ? "bg-lime-400 text-slate-900"
                  : state === "active"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-200 text-slate-500")
              }
            >
              {state === "done" ? "✓" : n}
            </span>
            <span
              className={
                "hidden text-sm sm:block " +
                (state === "active"
                  ? "font-semibold text-slate-900"
                  : "text-slate-500")
              }
            >
              {label}
            </span>
            {n < STEPS.length && (
              <span className="ml-2 hidden h-px flex-1 bg-slate-300 sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
