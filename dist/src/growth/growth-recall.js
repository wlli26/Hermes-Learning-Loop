export function buildGrowthPromptAddition(params) {
    const memoryBlock = params.memories
        .map((item) => `- ${item.title}: ${item.content}`)
        .join("\n");
    const maxChars = params.maxSkillContentChars ?? 2000;
    let remainingBudget = maxChars;
    const skillBlock = params.skills
        .map((item) => {
        const header = `- ${item.slug} [${item.state}]: ${item.summary}`;
        // 对 promoted skill 注入全文内容
        if (item.state === "promoted" && item.content && remainingBudget > 0) {
            const truncated = item.content.slice(0, remainingBudget);
            remainingBudget -= truncated.length;
            return `${header}\n\`\`\`\n${truncated}\n\`\`\``;
        }
        return header;
    })
        .join("\n");
    return [
        "## Learned Memory",
        "These are facts about the user and environment that you've learned from previous interactions.",
        "Treat these as declarative facts that inform your decisions, not as rigid commands.",
        memoryBlock || "- none",
        "",
        "## Learned Skills",
        "These are reusable procedures you've developed from past tasks.",
        "When a task matches a skill's 'When to Use' criteria, follow its Procedure steps.",
        "If you encounter issues not covered by the skill, note them for future skill updates.",
        skillBlock || "- none",
        "",
        "**Note:** Skills marked [promoted] include full procedure details. Skills marked [candidate] show only summaries — use skill_view tool to load full content if needed.",
    ].join("\n");
}
