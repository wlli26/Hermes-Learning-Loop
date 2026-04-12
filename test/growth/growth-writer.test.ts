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

  it("normalizes structured skill candidates returned by the review model", () => {
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
      summary: "learned hermes acceptance workflow",
      complexityScore: 19,
      reasonCodes: ["tool-call-force-threshold"],
      rawResult: {},
    });

    applyGrowthResult({
      store,
      reviewId,
      result: {
        summary: "learned hermes acceptance workflow",
        memoryCandidates: [],
        skillCandidates: [
          {
            title: "Hermes Learning 插件验收技能",
            why: "This is a reusable workflow for validating the plugin.",
            scope:
              "Use when asked to validate a Hermes Learning/OpenClaw plugin repo.",
            inputs: [
              "Repository root",
              "Key files: package.json, src/index.ts, test/context/plugin-entry.test.ts",
            ],
            coreSteps: [
              "Read the three key files in order.",
              "Run the focused plugin-entry test.",
              "Run the build and inspect .openclaw-hermes artifacts.",
            ],
            outputs: ["Acceptance report", "Observed artifacts"],
            caveats: ["Keep the workflow read-only."],
          },
        ] as never[],
        dedupeHints: [],
        reuseConfidence: 0.88,
      },
    });

    const skillDoc = fs.readFileSync(
      path.join(root, "skills", "hermes-learning", "SKILL.md"),
      "utf8",
    );
    expect(skillDoc).toContain("---\nname: hermes-learning");
    expect(skillDoc).toContain(
      'description: "This is a reusable workflow for validating the plugin."',
    );
    expect(skillDoc).toContain("# Hermes Learning 插件验收技能");
    expect(skillDoc).toContain("## When to Use");
    expect(skillDoc).toContain("## Procedure");
    expect(skillDoc).toContain("Run the focused plugin-entry test.");
    expect(skillDoc).toContain("## Outputs");

    const state = JSON.parse(
      fs.readFileSync(path.join(root, "state.json"), "utf8"),
    ) as {
      skills: Record<string, { summary: string; confidence: number }>;
    };
    expect(state.skills["hermes-learning"]?.summary).toContain("reusable workflow");
    expect(state.skills["hermes-learning"]?.confidence).toBe(0.88);
  });
});
