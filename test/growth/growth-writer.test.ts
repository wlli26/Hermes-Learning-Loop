import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyGrowthResult } from "../../src/growth/growth-writer.js";
import { LearningStore } from "../../src/store/learning-store.js";

describe("applyGrowthResult", () => {
  it("writes memory and candidate skill into agent-scoped store", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "growth-writer-"));
    const store = new LearningStore({
      rootDir: root,
      auditLogFile: path.join(root, "learning-log.jsonl"),
      reviewsDir: path.join(root, "reviews"),
      skillsDir: path.join(root, "skills"),
      memoryDir: path.join(root, "memory"),
      stateFile: path.join(root, "state.json"),
    });
    store.initialize();
    const reviewId = store.saveReview({
      summary: "learned follow-up protocol",
      complexityScore: 12,
      reasonCodes: ["tool-call-force-threshold"],
      rawResult: {},
    });

    applyGrowthResult({
      store,
      reviewId,
      result: {
        summary: "learned follow-up protocol",
        memoryCandidates: [
          {
            kind: "durable-memory",
            title: "Follow-up preference",
            content: "User prefers terse follow-up summaries.",
            confidence: 0.85,
          },
        ],
        skillCandidates: [
          {
            slug: "follow-up-protocol",
            title: "Follow-up protocol",
            summary: "Close tasks with terse summaries",
            content: "# Follow-up protocol\n",
            confidence: 0.91,
          },
        ],
        dedupeHints: [],
        reuseConfidence: 0.9,
      },
    });

    expect(
      fs.readFileSync(path.join(root, "memory", "durable.md"), "utf8"),
    ).toContain("Follow-up preference");
    expect(
      fs.readFileSync(
        path.join(root, "skills", "follow-up-protocol", "SKILL.md"),
        "utf8",
      ),
    ).toContain("# Follow-up protocol");
  });
});
