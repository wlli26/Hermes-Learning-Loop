export function buildReviewPrompt(params: {
  conversationSummary: string;
  reasonCodes: string[];
}) {
  return [
    "Review the completed OpenClaw turn and decide what is worth learning.",
    "Output strict JSON with keys: summary, memoryCandidates, skillCandidates, dedupeHints, reuseConfidence.",
    "Only write reusable skills for non-trivial workflows.",
    `Trigger reasons: ${params.reasonCodes.join(", ")}`,
    `Conversation summary:\n${params.conversationSummary}`,
  ].join("\n\n");
}
