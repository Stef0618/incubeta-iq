"use client";

import { useRef, useState } from "react";
import type { CandidateScore, Rubric } from "@/types";

interface Props {
  rubric: Rubric;
  onComplete: (scores: CandidateScore[]) => void;
  onBack: () => void;
}

type FileStatus = "queued" | "scoring" | "done" | "error";

interface QueuedFile {
  file: File;
  status: FileStatus;
  score?: CandidateScore;
  error?: string;
}

const CONCURRENCY = 3;

export default function ResumeScoring({ rubric, onComplete, onBack }: Props) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[]) {
    const accepted = Array.from(list).filter((f) =>
      /\.(pdf|docx)$/i.test(f.name)
    );
    setFiles((prev) => {
      const existing = new Set(prev.map((q) => q.file.name));
      const fresh = accepted
        .filter((f) => !existing.has(f.name))
        .map((file) => ({ file, status: "queued" as FileStatus }));
      return [...prev, ...fresh];
    });
  }

  async function scoreOne(qf: QueuedFile): Promise<QueuedFile> {
    const form = new FormData();
    form.append("file", qf.file);
    form.append("rubric", JSON.stringify(rubric));
    try {
      const res = await fetch("/api/score", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      return { ...qf, status: "done", score: data.score };
    } catch (err) {
      return {
        ...qf,
        status: "error",
        error: err instanceof Error ? err.message : "Scoring failed",
      };
    }
  }

  async function runBatch() {
    setRunning(true);
    // Snapshot of pending work; results stream back into state as they land.
    const pending = files
      .map((qf, idx) => ({ qf, idx }))
      .filter(({ qf }) => qf.status === "queued" || qf.status === "error");

    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const { qf, idx } = pending[cursor++];
        setFiles((prev) =>
          prev.map((x, i) => (i === idx ? { ...x, status: "scoring" } : x))
        );
        const result = await scoreOne(qf);
        setFiles((prev) => prev.map((x, i) => (i === idx ? result : x)));
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker)
    );
    setRunning(false);
  }

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const allSettled =
    files.length > 0 && files.every((f) => f.status === "done" || f.status === "error");
  const hasQueued = files.some(
    (f) => f.status === "queued" || f.status === "error"
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">
        Resume Scoring: {rubric.roleTitle}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Drop PDF or DOCX resumes below. Files are parsed in-memory, scored
        against the approved rubric, and discarded. Nothing is stored.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={
          "mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors " +
          (dragOver
            ? "border-lime-400 bg-lime-50"
            : "border-slate-300 hover:border-slate-400")
        }
      >
        <p className="text-sm font-medium text-slate-700">
          Drag and drop resumes here, or click to browse
        </p>
        <p className="mt-1 text-xs text-slate-500">
          PDF or DOCX · one file or hundreds
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {files.length} file{files.length === 1 ? "" : "s"} · {doneCount}{" "}
              scored
              {errorCount > 0 && (
                <span className="text-red-600"> · {errorCount} failed</span>
              )}
            </span>
            {running && (
              <span className="flex items-center gap-2 text-slate-500">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
                scoring…
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-lime-400 transition-all"
              style={{
                width: `${((doneCount + errorCount) / files.length) * 100}%`,
              }}
            />
          </div>

          <ul className="mt-4 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {files.map((qf) => (
              <li
                key={qf.file.name}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="truncate">{qf.file.name}</span>
                <span className="shrink-0 text-xs">
                  {qf.status === "queued" && (
                    <span className="text-slate-400">queued</span>
                  )}
                  {qf.status === "scoring" && (
                    <span className="text-slate-600">scoring…</span>
                  )}
                  {qf.status === "done" && qf.score && (
                    <span className="font-semibold text-lime-700">
                      {qf.score.finalScore.toFixed(2)} · {qf.score.band}
                    </span>
                  )}
                  {qf.status === "error" && (
                    <span className="text-red-600" title={qf.error}>
                      {qf.error}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={running}
          className="text-sm text-slate-500 hover:text-slate-900 disabled:opacity-40"
        >
          ← Back to rubric
        </button>
        <div className="flex gap-3">
          {hasQueued && (
            <button
              onClick={runBatch}
              disabled={running}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {errorCount > 0 && doneCount + errorCount === files.length
                ? "Retry Failed"
                : "Score Resumes"}
            </button>
          )}
          {allSettled && doneCount > 0 && (
            <button
              onClick={() =>
                onComplete(
                  files
                    .filter((f) => f.status === "done" && f.score)
                    .map((f) => f.score!)
                )
              }
              disabled={running}
              className="rounded-lg bg-lime-400 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-lime-300 disabled:opacity-40"
            >
              View Results →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
