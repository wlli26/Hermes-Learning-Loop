import { describe, expect, it, vi } from "vitest";
import { createHermesLearningEngine } from "../../src/context/hermes-learning-engine.js";

describe("createHermesLearningEngine", () => {
  it("runs review on afterTurn and injects growth on assemble", async () => {
    const store = {
      listRecentMemories: vi
        .fn()
        .mockReturnValue([{ title: "Preference", content: "Keep replies terse." }]),
      listActiveSkills: vi
        .fn()
        .mockReturnValue([
          { slug: "terse-close", summary: "Close tasks tersely", state: "candidate" },
        ]),
      saveReview: vi.fn().mockReturnValue("review_1"),
    };
    const engine = createHermesLearningEngine({
      store: store as never,
      reviewThresholds: {
        toolCallCandidateThreshold: 6,
        toolCallForceThreshold: 10,
        cooldownTurns: 2,
        retryWeight: 1,
        rerouteWeight: 1,
        userCorrectionWeight: 1,
      },
      decideReview: vi.fn().mockReturnValue({
        shouldReview: true,
        reasonCodes: ["tool-call-force-threshold"],
        complexityScore: 12,
      }),
      runSilentReview: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          summary: "learned terse closeout",
          memoryCandidates: [],
          skillCandidates: [],
          dedupeHints: [],
          reuseConfidence: 0.9,
        }),
      }),
      applyGrowthResult: vi.fn(),
      buildReviewPrompt: vi.fn().mockReturnValue("review prompt"),
      buildGrowthPromptAddition: vi
        .fn()
        .mockReturnValue("Learned Memory:\n- Preference: Keep replies terse."),
    });

    const assemble = await engine.assemble({
      sessionId: "s1",
      messages: [],
      tokenBudget: 1000,
    });

    expect(assemble.systemPromptAddition).toContain("Learned Memory");

    await engine.afterTurn?.({
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      messages: [
        { role: "assistant", content: "done" },
        { role: "tool", name: "read_file", content: "ok" },
        { role: "tool", name: "search_files", content: "ok" },
        { role: "tool", name: "write_file", content: "ok" },
        { role: "tool", name: "patch", content: "ok" },
        { role: "tool", name: "session_search", content: "ok" },
        { role: "tool", name: "skill_view", content: "ok" },
        { role: "tool", name: "memory_search", content: "ok" },
        { role: "tool", name: "memory_get", content: "ok" },
        { role: "tool", name: "browser", content: "ok" },
        { role: "tool", name: "message", content: "ok" },
      ] as never[],
      prePromptMessageCount: 0,
    });

    expect(store.saveReview).toHaveBeenCalled();
  });
});
