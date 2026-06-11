"use client";

import { useState } from "react";
import type { Band, CandidateScore, Rubric } from "@/types";

interface Props {
  rubric: Rubric;
  scores: CandidateScore[];
  onScoreMore: () => void;
  onStartOver: () => void;
}

const BAND_STYLES: Record<Band, string> = {
  ADVANCE: "bg-lime-100 text-lime-800",
  CONSIDER: "bg-sky-100 text-sky-800",
  BORDERLINE: "bg-amber-100 text-amber-800",
  DECLINE: "bg-red-100 text-red-700",
};

export default function Results({
  rubric,
  scores,
  onScoreMore,
  onStartOver,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    sheetUrl: string;
    tabTitle: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const ranked = [...scores].sort((a, b) => b.finalScore - a.finalScore);
  const advanceCount = ranked.filter((s) => s.band === "ADVANCE").length;

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubric, scores: ranked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Export failed (${res.status})`);
      setExportResult(data);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Results: {rubric.roleTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {ranked.length} candidate{ranked.length === 1 ? "" : "s"} scored ·{" "}
            {advanceCount} in the ADVANCE band
          </p>
        </div>
        <div className="flex items-center gap-3">
          {exportResult ? (
            <a
              href={exportResult.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-lime-500 bg-lime-50 px-4 py-2 text-sm font-medium text-lime-800 hover:bg-lime-100"
            >
              Open “{exportResult.tabTitle}” in Sheets ↗
            </a>
          ) : (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? "Exporting…" : "Export to Google Sheets"}
            </button>
          )}
        </div>
      </div>

      {exportError && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {exportError}
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Candidate</th>
              <th className="px-2 py-2">Band</th>
              <th className="px-2 py-2 text-right">Score</th>
              <th className="px-2 py-2">Flags</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {ranked.map((s, i) => {
              const isOpen = expanded === s.fileName;
              return [
                <tr
                  key={s.fileName}
                  onClick={() => setExpanded(isOpen ? null : s.fileName)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-2 py-2.5 text-slate-500">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <span className="font-medium">{s.candidateName}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {s.fileName}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className={
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                        BAND_STYLES[s.band]
                      }
                    >
                      {s.band}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono font-semibold">
                    {s.disqualified ? "DQ" : s.finalScore.toFixed(2)}
                  </td>
                  <td className="px-2 py-2.5 text-xs">
                    {s.redFlagsTriggered.length > 0 && (
                      <span className="text-red-600">
                        {s.redFlagsTriggered.length} red flag
                        {s.redFlagsTriggered.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {s.redFlagsTriggered.length > 0 &&
                      s.bonusesAwarded.length > 0 && (
                        <span className="text-slate-400"> · </span>
                      )}
                    {s.bonusesAwarded.length > 0 && (
                      <span className="text-lime-700">
                        {s.bonusesAwarded.length} bonus
                        {s.bonusesAwarded.length === 1 ? "" : "es"}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right text-xs text-slate-400">
                    {isOpen ? "▲" : "▼"}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={s.fileName + "-detail"} className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={6} className="px-4 py-4">
                      <CandidateDetail score={s} />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onStartOver}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Start a new role
        </button>
        <button
          onClick={onScoreMore}
          className="text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          ← Score more resumes
        </button>
      </div>
    </div>
  );
}

function CandidateDetail({ score }: { score: CandidateScore }) {
  return (
    <div className="space-y-4 text-sm">
      {score.disqualified ? (
        <p className="text-red-700">
          <span className="font-semibold">Disqualified:</span>{" "}
          {score.disqualifierReason}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {score.categoryScores.map((c) => (
            <div
              key={c.categoryId}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.categoryName}</span>
                <span className="font-mono font-semibold">
                  {c.score}/4
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    ×{c.weight}%
                  </span>
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{c.evidence}</p>
            </div>
          ))}
        </div>
      )}

      {score.redFlagsTriggered.length > 0 && (
        <div>
          <p className="font-semibold text-red-700">Red flags</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-700">
            {score.redFlagsTriggered.map((r, i) => (
              <li key={i}>
                <span className="font-medium">
                  {r.text} (−{r.deduction}):
                </span>{" "}
                {r.evidence}
              </li>
            ))}
          </ul>
        </div>
      )}

      {score.bonusesAwarded.length > 0 && (
        <div>
          <p className="font-semibold text-lime-700">Bonuses</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-700">
            {score.bonusesAwarded.map((b, i) => (
              <li key={i}>
                <span className="font-medium">
                  {b.text} (+{b.points}):
                </span>{" "}
                {b.evidence}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="font-semibold">Evaluator summary</p>
        <p className="mt-1 text-slate-700">{score.summary}</p>
      </div>
    </div>
  );
}
