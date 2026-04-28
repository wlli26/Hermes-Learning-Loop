import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "../../src/review/review-prompt.js";
describe("buildReviewPrompt", () => {
    it("explicitly encourages reusable skill extraction without requiring workflow wording", () => {
        const prompt = buildReviewPrompt({
            conversationSummary: "user 想找一个人吃的晚餐，assistant 做了多轮筛选和比较。",
            reasonCodes: ["tool-call-force-threshold"],
        });
        expect(prompt).toContain("Non-trivial workflow or troubleshooting sequence discovered");
        expect(prompt).toContain("template skill");
        expect(prompt).toContain("Ignore bootstrap noise");
    });
});
