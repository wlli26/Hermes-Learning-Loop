export function buildReviewPrompt(params) {
    const sections = [
        "Review the completed OpenClaw turn and decide what is worth learning.",
        "Output strict JSON with keys: summary, memoryCandidates, skillCandidates, dedupeHints, reuseConfidence.",
        "",
        "## Memory Candidates",
        "Each memory candidate must have: { kind, title, content, confidence }",
        '- kind: "user-model" (preferences/context) or "durable" (facts/conclusions)',
        "- title: short descriptive title",
        "- content: 1-3 sentences",
        "- confidence: 0-1",
        "",
        "### Memory Writing Principles",
        "**Write memories as declarative facts, NOT instructions:**",
        '- ✓ "User prefers concise responses"    ✗ "Always respond concisely"',
        '- ✓ "Project uses pytest with xdist"    ✗ "Run tests with pytest -n 4"',
        "",
        "**Memory vs Skill boundary:**",
        "- Memory = FACTS (preferences, environment, tool quirks, conventions)",
        "- Skill = PROCEDURES (step-by-step workflows, decision flows)",
        "- If you discovered how to DO something, it's a skill — not a memory.",
        "",
        "**Priority signals to always extract as user-model:**",
        "- Language/locale corrections (\"use Chinese\", \"write in English\")",
        "- Output format preferences (file formats, visual styles)",
        "- Workflow preferences (where/how files should be saved)",
        "- Communication style (tone, verbosity, depth)",
        "",
        "## Skill Candidates",
        "Each skill candidate must have: { slug, title, summary, content, confidence }",
        "- slug: kebab-case identifier",
        "- title: human-readable title",
        "- summary: one-sentence description",
        "- content: full SKILL.md with YAML frontmatter and sections (When to Use, Inputs, Procedure, Outputs, Caveats)",
        "- confidence: 0-1",
        "",
        "### Slug Naming Principles (CRITICAL for reusability)",
        "**Describe the CAPABILITY, not the specific scenario:**",
        '- ✓ "create-data-presentation"       ✗ "market-ppt-with-data-and-charts"',
        '- ✓ "deploy-to-kubernetes"           ✗ "deploy-nginx-to-k8s-with-ssl"',
        '- ✓ "generate-slide-deck"            ✗ "generate-chinese-data-driven-ppt-locally"',
        "",
        "**Rules:**",
        "- Use generic terms: \"presentation\" not \"PPT\", \"deploy\" not \"deploy-nginx\"",
        "- Strip scenario-specific modifiers: language, topic, company, format details",
        "- A good slug should work for many similar tasks, not just one",
        "- Before creating a new slug, check the Existing Skills list — if an existing skill covers 70%+ of the capability, REUSE its slug and update the content instead",
        "",
        "### When to create or update a skill",
        "Create/update when ANY of these apply:",
        "- Complex task with 5+ tool calls that succeeded",
        "- Errors encountered and overcome (capture the fix)",
        "- User corrected the approach and the correction worked",
        "- Non-trivial workflow or troubleshooting sequence discovered",
        "- Existing skill had gaps, stale steps, or missing caveats",
        "",
        "A high-quality skill includes:",
        "- Stable, repeatable steps (not one-off actions)",
        "- Pitfalls/caveats from real failures",
        "- Recovery strategies for common failures",
        "- OS/environment-specific notes when relevant",
        "",
        "### Updating existing skills (patch-style preferred)",
        "When improving an existing skill, you MUST emit a skillCandidate with the SAME slug AND include that slug in dedupeHints.",
        "Preserve validated parts and change only what's new — add missing steps, add new caveats, refine wrong wording.",
        "The content field should contain the complete revised SKILL.md (not just the diff).",
        "",
        "Do NOT update a skill when it worked perfectly, changes are cosmetic, or the task was outside its scope.",
        "",
        "### When to create a template skill (for creative tasks)",
        "Create a template skill when ALL of these apply:",
        "- User explicitly corrected the style/tone/format (not just factual content)",
        "- The correction revealed a stable output pattern (e.g., 'Xiaohongshu blogger tone', 'formal report style')",
        "- The pattern is reusable across different topics/subjects",
        "- Confidence >= 0.75",
        "",
        "Template skills differ from procedure skills:",
        "- They capture OUTPUT PATTERNS, not step-by-step workflows",
        "- They include: tone description, structural template, example phrases, formatting rules",
        '- Slug prefix: "template-" (e.g., "template-xiaohongshu-food-post", "template-formal-report")',
        "- They do NOT require complex tool calls or technical procedures",
        "",
        "## Guidelines",
        "**Quality over quantity:** If nothing is truly worth saving, return empty arrays. Don't force low-value entries.",
        "**Unmaintained skills become liabilities:** Only create skills for patterns confident to recur.",
        "**Ignore bootstrap noise:** Reading SOUL.md/USER.md/MEMORY.md, web-tools guidance, benign ENOENTs are not substantive unless they are the actual task.",
        "",
        "**Implicit correction signals (also count as user corrections):**",
        "- User provides a revised version without explicit 'wrong' marker",
        "- User asks to 'redo' or 'try again' after seeing output",
        "- User's follow-up message contradicts the previous assistant output",
        "",
        "**Confidence scoring:**",
        "- 0.9-1.0: Explicitly corrected/confirmed by user multiple times",
        "- 0.7-0.9: Clear pattern, high reuse potential",
        "- 0.5-0.7: Useful but may need refinement",
        "- Below 0.5: Don't emit",
    ];
    // 添加现有知识上下文
    if ((params.existingMemories && params.existingMemories.length > 0) ||
        (params.existingSkills && params.existingSkills.length > 0)) {
        sections.push("", "## Existing Knowledge (do NOT create duplicates)", "", "If a memory candidate matches existing knowledge, include its title in dedupeHints and skip memoryCandidates.", "If a skill should be updated, include its slug in BOTH dedupeHints AND skillCandidates (with the full revised SKILL.md).", "Check existing skill slugs carefully — prefer reusing a close match over creating a new slug.");
        if (params.existingMemories && params.existingMemories.length > 0) {
            sections.push("", "### Memories");
            for (const memory of params.existingMemories) {
                sections.push(`- ${memory.title}: ${memory.content}`);
            }
        }
        if (params.existingSkills && params.existingSkills.length > 0) {
            sections.push("", "### Skills");
            for (const skill of params.existingSkills) {
                sections.push(`- ${skill.slug}: ${skill.summary}`);
            }
        }
    }
    sections.push("", `Trigger reasons: ${params.reasonCodes.join(", ")}`, `Conversation summary:\n${params.conversationSummary}`);
    return sections.join("\n");
}
