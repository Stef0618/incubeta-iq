"use client";

import { useState } from "react";
import type {
  ClarifyingQuestion,
  QuestionAnswer,
  Rubric,
  RubricCategory,
} from "@/types";

interface Props {
  questions: ClarifyingQuestion[];
  rubric: Rubric | null;
  busy: boolean;
  onGenerate: (answers: QuestionAnswer[]) => void;
  onApprove: (rubric: Rubric) => void;
  onBack: () => void;
}

export default function RubricReview(props: Props) {
  return props.rubric ? (
    <RubricEditor
      rubric={props.rubric}
      onApprove={props.onApprove}
      onBack={props.onBack}
    />
  ) : (
    <QuestionsForm
      questions={props.questions}
      busy={props.busy}
      onGenerate={props.onGenerate}
      onBack={props.onBack}
    />
  );
}

function QuestionsForm({
  questions,
  busy,
  onGenerate,
  onBack,
}: {
  questions: ClarifyingQuestion[];
  busy: boolean;
  onGenerate: (answers: QuestionAnswer[]) => void;
  onBack: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function submit() {
    onGenerate(
      questions.map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: answers[q.id] ?? "",
      }))
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Clarifying Questions</h2>
      <p className="mt-1 text-sm text-slate-600">
        Recruit IQ reviewed your inputs and has {questions.length} follow-up
        question{questions.length === 1 ? "" : "s"} to sharpen the rubric.
        Answer what you can. Unanswered questions fall back to well-reasoned
        defaults.
      </p>

      <div className="mt-6 space-y-5">
        {questions.map((q, i) => (
          <div key={q.id}>
            <label className="block text-sm" htmlFor={q.id}>
              <span className="font-medium text-slate-900">
                {i + 1}. {q.question}
              </span>
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                {q.topic}
              </span>
            </label>
            <input
              id={q.id}
              type="text"
              value={answers[q.id] ?? ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
              }
              placeholder="Optional"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={busy}
          className="text-sm text-slate-500 hover:text-slate-900 disabled:opacity-40"
        >
          ← Back to role setup
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate Rubric
        </button>
      </div>
    </div>
  );
}

function RubricEditor({
  rubric: initial,
  onApprove,
  onBack,
}: {
  rubric: Rubric;
  onApprove: (rubric: Rubric) => void;
  onBack: () => void;
}) {
  const [rubric, setRubric] = useState<Rubric>(initial);

  const weightSum = rubric.categories.reduce((s, c) => s + c.weight, 0);
  const weightsOk = Math.abs(weightSum - 100) < 0.01;
  const canApprove = weightsOk && rubric.categories.length > 0;

  function updateCategory(id: string, patch: Partial<RubricCategory>) {
    setRubric((r) => ({
      ...r,
      categories: r.categories.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    }));
  }

  const inputCls =
    "rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Review Rubric: {rubric.roleTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Every field is editable. Nothing is scored until you approve.
            </p>
          </div>
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (weightsOk
                ? "bg-lime-100 text-lime-800"
                : "bg-red-100 text-red-700")
            }
          >
            Weights: {weightSum}%
          </span>
        </div>

        {/* Categories */}
        <div className="mt-6 space-y-4">
          {rubric.categories.map((cat) => (
            <div key={cat.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <input
                  className={inputCls + " flex-1 font-medium"}
                  value={cat.name}
                  onChange={(e) =>
                    updateCategory(cat.id, { name: e.target.value })
                  }
                />
                <label className="flex items-center gap-1 text-sm text-slate-600">
                  <input
                    type="number"
                    className={inputCls + " w-20 text-right"}
                    value={cat.weight}
                    onChange={(e) =>
                      updateCategory(cat.id, {
                        weight: Number(e.target.value) || 0,
                      })
                    }
                  />
                  %
                </label>
                <button
                  onClick={() =>
                    setRubric((r) => ({
                      ...r,
                      categories: r.categories.filter((c) => c.id !== cat.id),
                    }))
                  }
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Criteria
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {cat.criteria.map((cr) => (
                    <div key={cr.id} className="flex items-center gap-2">
                      <input
                        className={inputCls + " flex-1"}
                        value={cr.text}
                        onChange={(e) =>
                          updateCategory(cat.id, {
                            criteria: cat.criteria.map((x) =>
                              x.id === cr.id ? { ...x, text: e.target.value } : x
                            ),
                          })
                        }
                      />
                      <button
                        onClick={() =>
                          updateCategory(cat.id, {
                            criteria: cat.criteria.filter(
                              (x) => x.id !== cr.id
                            ),
                          })
                        }
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      updateCategory(cat.id, {
                        criteria: [
                          ...cat.criteria,
                          { id: `${cat.id}-cr${Date.now()}`, text: "" },
                        ],
                      })
                    }
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    + Add criterion
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Level descriptors
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {cat.levels.map((lvl) => (
                    <div key={lvl.score} className="flex items-start gap-2">
                      <span className="mt-1.5 w-24 shrink-0 text-xs font-medium text-slate-600">
                        {lvl.score} · {lvl.label}
                      </span>
                      <textarea
                        rows={2}
                        className={inputCls + " flex-1 text-xs leading-relaxed"}
                        value={lvl.description}
                        onChange={(e) =>
                          updateCategory(cat.id, {
                            levels: cat.levels.map((x) =>
                              x.score === lvl.score
                                ? { ...x, description: e.target.value }
                                : x
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Red flags / bonuses / disqualifiers */}
        <ListEditor
          title="Red Flags"
          hint="demerit points"
          items={rubric.redFlags.map((r) => ({
            id: r.id,
            text: r.text,
            value: r.deduction,
          }))}
          valueLabel="−"
          onChange={(items) =>
            setRubric((r) => ({
              ...r,
              redFlags: items.map((i) => ({
                id: i.id,
                text: i.text,
                deduction: i.value ?? 0,
              })),
            }))
          }
        />
        <ListEditor
          title="Bonus Criteria"
          hint="bonus points"
          items={rubric.bonusCriteria.map((b) => ({
            id: b.id,
            text: b.text,
            value: b.points,
          }))}
          valueLabel="+"
          onChange={(items) =>
            setRubric((r) => ({
              ...r,
              bonusCriteria: items.map((i) => ({
                id: i.id,
                text: i.text,
                points: i.value ?? 0,
              })),
            }))
          }
        />
        <ListEditor
          title="Disqualifiers"
          hint="instant rejection"
          items={rubric.disqualifiers.map((d) => ({ id: d.id, text: d.text }))}
          onChange={(items) =>
            setRubric((r) => ({
              ...r,
              disqualifiers: items.map((i) => ({ id: i.id, text: i.text })),
            }))
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to role setup
        </button>
        <div className="flex items-center gap-3">
          {!weightsOk && (
            <span className="text-sm text-red-600">
              Category weights must sum to 100%
            </span>
          )}
          <button
            onClick={() => onApprove(rubric)}
            disabled={!canApprove}
            className="rounded-lg bg-lime-400 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Approve Rubric → Score Resumes
          </button>
        </div>
      </div>
    </div>
  );
}

interface ListItem {
  id: string;
  text: string;
  value?: number;
}

function ListEditor({
  title,
  hint,
  items,
  valueLabel,
  onChange,
}: {
  title: string;
  hint: string;
  items: ListItem[];
  valueLabel?: string;
  onChange: (items: ListItem[]) => void;
}) {
  const hasValue = valueLabel !== undefined;
  const inputCls =
    "rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none";

  return (
    <div className="mt-6">
      <p className="text-sm font-semibold">
        {title}{" "}
        <span className="font-normal text-slate-500">({hint})</span>
      </p>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <input
              className={inputCls + " flex-1"}
              value={item.text}
              onChange={(e) =>
                onChange(
                  items.map((x) =>
                    x.id === item.id ? { ...x, text: e.target.value } : x
                  )
                )
              }
            />
            {hasValue && (
              <label className="flex items-center gap-1 text-sm text-slate-500">
                {valueLabel}
                <input
                  type="number"
                  step="0.1"
                  className={inputCls + " w-20 text-right"}
                  value={item.value ?? 0}
                  onChange={(e) =>
                    onChange(
                      items.map((x) =>
                        x.id === item.id
                          ? { ...x, value: Number(e.target.value) || 0 }
                          : x
                      )
                    )
                  }
                />
              </label>
            )}
            <button
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            onChange([
              ...items,
              {
                id: `item${Date.now()}`,
                text: "",
                ...(hasValue ? { value: 0 } : {}),
              },
            ])
          }
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
