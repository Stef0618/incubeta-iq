// Shared domain types for Recruit IQ.

export interface RubricLevel {
  score: number; // 1-4
  label: string; // Exceptional / Strong / Adequate / Inadequate
  description: string;
}

export interface RubricCriterion {
  id: string;
  text: string;
}

export interface RubricCategory {
  id: string;
  name: string;
  weight: number; // percentage, all category weights sum to 100
  criteria: RubricCriterion[];
  levels: RubricLevel[];
}

export interface RedFlag {
  id: string;
  text: string;
  deduction: number; // demerit points subtracted from the raw weighted score
}

export interface BonusCriterion {
  id: string;
  text: string;
  points: number; // bonus points added to the raw weighted score
}

export interface Disqualifier {
  id: string;
  text: string;
}

export interface Rubric {
  roleTitle: string;
  categories: RubricCategory[];
  redFlags: RedFlag[];
  bonusCriteria: BonusCriterion[];
  disqualifiers: Disqualifier[];
}

export interface ClarifyingQuestion {
  id: string;
  topic: string; // the category or area the question targets
  question: string;
}

export interface QuestionAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export type Band = "ADVANCE" | "CONSIDER" | "BORDERLINE" | "DECLINE";

export interface CategoryScore {
  categoryId: string;
  categoryName: string;
  weight: number;
  score: number; // 1-4
  evidence: string;
}

export interface TriggeredRedFlag {
  text: string;
  deduction: number;
  evidence: string;
}

export interface AwardedBonus {
  text: string;
  points: number;
  evidence: string;
}

export interface CandidateScore {
  candidateName: string;
  fileName: string;
  disqualified: boolean;
  disqualifierReason: string | null;
  categoryScores: CategoryScore[];
  redFlagsTriggered: TriggeredRedFlag[];
  bonusesAwarded: AwardedBonus[];
  rawWeightedScore: number;
  finalScore: number;
  band: Band;
  summary: string;
}
