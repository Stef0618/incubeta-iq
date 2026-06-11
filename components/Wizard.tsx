"use client";

import { useState } from "react";
import type {
  CandidateScore,
  ClarifyingQuestion,
  QuestionAnswer,
  Rubric,
} from "@/types";
import StepIndicator from "./StepIndicator";
import RoleSetup from "./steps/RoleSetup";
import RubricReview from "./steps/RubricReview";
import ResumeScoring from "./steps/ResumeScoring";
import Results from "./steps/Results";

export interface RoleInputs {
  roleTitle: string;
  jobDescription: string;
  scoringCriteria: string;
}

export default function Wizard() {
  const [step, setStep] = useState(1);
  const [inputs, setInputs] = useState<RoleInputs>({
    roleTitle: "",
    jobDescription: "",
    scoringCriteria: "",
  });
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [scores, setScores] = useState<CandidateScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function callRubricApi(
    action: "questions" | "generate",
    answers?: QuestionAnswer[]
  ) {
    const res = await fetch("/api/rubric", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...inputs, answers }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data;
  }

  async function handleGenerateQuestions() {
    setError(null);
    setLoading("Reviewing your inputs and preparing clarifying questions…");
    try {
      const data = await callRubricApi("questions");
      setQuestions(data.questions);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateRubric(answers: QuestionAnswer[]) {
    setError(null);
    setLoading("Building the weighted rubric. This runs on the deep-reasoning model and can take a minute…");
    try {
      const data = await callRubricApi("generate", answers);
      setRubric(data.rubric);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  function handleApproveRubric(approved: Rubric) {
    setRubric(approved);
    setScores([]);
    setStep(3);
  }

  function handleScoringComplete(results: CandidateScore[]) {
    setScores(results);
    setStep(4);
  }

  function handleStartOver() {
    setStep(1);
    setQuestions([]);
    setRubric(null);
    setScores([]);
    setError(null);
  }

  return (
    <div>
      <StepIndicator current={step} />

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
          {loading}
        </div>
      )}

      {step === 1 && (
        <RoleSetup
          inputs={inputs}
          onChange={setInputs}
          onSubmit={handleGenerateQuestions}
          busy={loading !== null}
        />
      )}

      {step === 2 && (
        <RubricReview
          questions={questions}
          rubric={rubric}
          busy={loading !== null}
          onGenerate={handleGenerateRubric}
          onApprove={handleApproveRubric}
          onBack={() => {
            setRubric(null);
            setStep(1);
          }}
        />
      )}

      {step === 3 && rubric && (
        <ResumeScoring
          rubric={rubric}
          onComplete={handleScoringComplete}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && rubric && (
        <Results
          rubric={rubric}
          scores={scores}
          onScoreMore={() => setStep(3)}
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}
