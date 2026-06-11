"use client";

import { useRef, useState } from "react";
import type { RoleInputs } from "../Wizard";

interface Props {
  inputs: RoleInputs;
  onChange: (inputs: RoleInputs) => void;
  onSubmit: () => void;
  busy: boolean;
}

export default function RoleSetup({ inputs, onChange, onSubmit, busy }: Props) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ready = inputs.roleTitle.trim() && inputs.jobDescription.trim();

  async function importJd(file: File) {
    setImporting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
      onChange({ ...inputs, jobDescription: data.text });
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Could not read the file"
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Role Setup</h2>
      <p className="mt-1 text-sm text-slate-600">
        Paste the Job Description (Tab 1 of the JD doc) or upload it as a
        file. Scoring criteria (Tab 2) are optional but recommended: skill
        categories, relative weights, red flags, disqualifiers, bonus
        criteria. Without them, Recruit IQ derives the rubric from the JD and
        leans harder on the clarifying questions.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-medium" htmlFor="roleTitle">
            Role title
          </label>
          <input
            id="roleTitle"
            type="text"
            value={inputs.roleTitle}
            onChange={(e) => onChange({ ...inputs, roleTitle: e.target.value })}
            placeholder="e.g. Senior Paid Media Specialist"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium" htmlFor="jd">
              Job description
            </label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing || busy}
              className="flex items-center gap-2 rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
            >
              {importing && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
              )}
              {importing ? "Reading file…" : "Upload PDF / DOCX"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importJd(file);
                e.target.value = "";
              }}
            />
          </div>
          {importError && (
            <p className="mt-1.5 text-xs text-red-600">{importError}</p>
          )}
          <textarea
            id="jd"
            value={inputs.jobDescription}
            onChange={(e) =>
              onChange({ ...inputs, jobDescription: e.target.value })
            }
            rows={10}
            placeholder="Paste the full job description, or upload it above…"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="criteria">
            Scoring criteria{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="criteria"
            value={inputs.scoringCriteria}
            onChange={(e) =>
              onChange({ ...inputs, scoringCriteria: e.target.value })
            }
            rows={8}
            placeholder="Categories, weights, evaluation criteria, red flags, disqualifiers, bonus criteria… Leave blank to derive these from the JD."
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed focus:border-slate-900 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onSubmit}
          disabled={!ready || busy || importing}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate Rubric
        </button>
      </div>
    </div>
  );
}
