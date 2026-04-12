import { describe, expect, it } from "vitest";
import { buildGrowthPromptAddition } from "../../src/growth/growth-recall.js";

describe("buildGrowthPromptAddition", () => {
  it("builds a compact system prompt addition from recent growth items", () => {
    const prompt = buildGrowthPromptAddition({
      memories: [
        {
          title: "Follow-up preference",
          content: "User prefers terse follow-up summaries.",
        },
      ],
      skills: [
        {
          slug: "follow-up-protocol",
          summary: "Close tasks with terse summaries",
          state: "candidate",
        },
      ],
    });

    expect(prompt).toContain("Learned Memory");
    expect(prompt).toContain("follow-up-protocol");
    expect(prompt).toContain("User prefers terse follow-up summaries.");
  });
});
