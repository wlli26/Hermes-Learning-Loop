import { describe, expect, it, vi } from "vitest";
import { runReviewWorker } from "../../src/review/review-worker.js";

describe("runReviewWorker", () => {
  it("parses structured JSON review output", async () => {
    const run = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: "learned a retry-first shell workflow",
        memoryCandidates: [],
        skillCandidates: [
          {
            slug: "retry-first-shell-workflow",
            title: "Retry-first shell workflow",
            summary: "Prefer quick verification before destructive retries",
            content: "# Retry-first shell workflow\n",
            confidence: 0.92,
          },
        ],
        dedupeHints: [],
        reuseConfidence: 0.92,
      }),
    });

    const result = await runReviewWorker({
      runSilentSubagent: run,
      prompt: "review now",
    });

    expect(run).toHaveBeenCalledWith({ prompt: "review now" });
    expect(result.skillCandidates[0]?.slug).toBe("retry-first-shell-workflow");
  });

  it("parses the first JSON object when the model adds trailing text", async () => {
    const run = vi.fn().mockResolvedValue({
      text: `${JSON.stringify({
        summary: "learned a retry-first shell workflow",
        memoryCandidates: [],
        skillCandidates: [],
        dedupeHints: [],
        reuseConfidence: 0.92,
      })}\n额外说明：上面是最终 JSON。`,
    });

    const result = await runReviewWorker({
      runSilentSubagent: run,
      prompt: "review now",
    });

    expect(result.summary).toBe("learned a retry-first shell workflow");
    expect(result.reuseConfidence).toBe(0.92);
  });
});
