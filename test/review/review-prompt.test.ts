import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "../../src/review/review-prompt.js";

describe("buildReviewPrompt", () => {
  it("explicitly encourages reusable skill extraction without requiring workflow wording", () => {
    const prompt = buildReviewPrompt({
      conversationSummary: "user 想找一个人吃的晚餐，assistant 做了多轮筛选和比较。",
      reasonCodes: ["tool-call-force-threshold"],
    });

    expect(prompt).toContain("method, checklist, decision rubric");
    expect(prompt).toContain("even if the user never asks for a \"workflow\" or \"SOP\"");
    expect(prompt).toContain("Ignore environment/bootstrap noise");
  });
});
