export type ReviewReasonCode =
  | "tool-call-candidate-threshold"
  | "tool-call-force-threshold"
  | "retry-amplifier"
  | "reroute-amplifier"
  | "user-correction-amplifier"
  | "cooldown-blocked";

export type SkillLifecycleState =
  | "candidate"
  | "promoted"
  | "stale"
  | "deprecated";

export type ReviewComplexityInput = {
  toolCalls: number;
  uniqueTools: number;
  retries: number;
  reroutes: number;
  userCorrections: number;
  turnIndex: number;
  lastReviewTurnIndex?: number;
};

export type ReviewDecision = {
  shouldReview: boolean;
  reasonCodes: ReviewReasonCode[];
  complexityScore: number;
};

export type ReviewCandidateMemory = {
  kind: "durable-memory" | "user-model";
  title: string;
  content: string;
  confidence: number;
};

export type ReviewCandidateSkill = {
  slug: string;
  title: string;
  summary: string;
  content: string;
  confidence: number;
};

export type ReviewResult = {
  summary: string;
  memoryCandidates: ReviewCandidateMemory[];
  skillCandidates: ReviewCandidateSkill[];
  dedupeHints: string[];
  reuseConfidence: number;
};
