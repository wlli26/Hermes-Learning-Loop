export function buildReviewPrompt(params: {
  conversationSummary: string;
  reasonCodes: string[];
}) {
  return [
    "Review the completed OpenClaw turn and decide what is worth learning.",
    "Output strict JSON with keys: summary, memoryCandidates, skillCandidates, dedupeHints, reuseConfidence.",
    "Treat a skill candidate as any reusable method, checklist, decision rubric, or tool-assisted pattern with stable steps, filters, or evaluation criteria.",
    'You may write a skill even if the user never asks for a "workflow" or "SOP", as long as the turn demonstrates a reusable way of working.',
    "When a turn compares options, applies recurring filters, or distills repeatable decision heuristics for everyday tasks, prefer capturing a skill candidate.",
    "Ignore environment/bootstrap noise such as reading SOUL.md, USER.md, MEMORY.md, daily memory files, web-tools guidance, or benign ENOENTs unless they are the substantive task.",
    "Prefer skillCandidates shaped as { slug, title, summary, content, confidence }.",
    "When writing skill content, make it a real SKILL.md: include YAML frontmatter with name and description, then concise sections such as When to Use, Inputs, Procedure, Outputs, and Caveats when applicable.",
    `Trigger reasons: ${params.reasonCodes.join(", ")}`,
    `Conversation summary:\n${params.conversationSummary}`,
  ].join("\n\n");
}
