export function buildGrowthPromptAddition(params: {
  memories: Array<{ title: string; content: string }>;
  skills: Array<{ slug: string; summary: string; state: string }>;
}) {
  const memoryBlock = params.memories
    .map((item) => `- ${item.title}: ${item.content}`)
    .join("\n");
  const skillBlock = params.skills
    .map((item) => `- ${item.slug} [${item.state}]: ${item.summary}`)
    .join("\n");

  return [
    "Learned Memory:",
    memoryBlock || "- none",
    "",
    "Learned Skills:",
    skillBlock || "- none",
  ].join("\n");
}
