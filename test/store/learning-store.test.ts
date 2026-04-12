import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LearningStore } from "../../src/store/learning-store.js";

describe("LearningStore", () => {
  it("creates schema and writes review audit data", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "learning-store-"));
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
      summary: "learned retry flow",
      complexityScore: 11,
      reasonCodes: ["tool-call-force-threshold"],
      rawResult: {
        summary: "learned retry flow",
        memoryCandidates: [],
        skillCandidates: [],
        dedupeHints: [],
        reuseConfidence: 0.9,
      },
    });

    expect(reviewId).toMatch(/^review_/);
    expect(fs.existsSync(path.join(root, "state.json"))).toBe(true);
    expect(
      fs.readFileSync(path.join(root, "learning-log.jsonl"), "utf8"),
    ).toContain("tool-call-force-threshold");
  });
});
