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
      listAllActiveSkills: vi
        .fn()
        .mockReturnValue([
          { slug: "terse-close", summary: "Close tasks tersely", state: "candidate" },
        ]),
      saveReview: vi.fn().mockReturnValue("review_1"),
      incrementHitCount: vi.fn(),
      recordSkillOutcome: vi.fn(),
      readSkillContent: vi.fn().mockReturnValue(undefined),
      hasSnapshot: vi.fn().mockReturnValue(false),
      freezeSnapshot: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({
        memories: [{ title: "Preference", content: "Keep replies terse." }],
        skills: [
          { slug: "terse-close", summary: "Close tasks tersely", state: "candidate" },
        ],
      }),
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
        minMemoryConfidence: 0.5,
        minSkillConfidence: 0.6,
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

  it("skips recursive review runs for review worker sessions", async () => {
    const store = {
      listRecentMemories: vi.fn().mockReturnValue([]),
      listActiveSkills: vi.fn().mockReturnValue([]),
      listAllActiveSkills: vi.fn().mockReturnValue([]),
      saveReview: vi.fn(),
      incrementHitCount: vi.fn(),
      recordSkillOutcome: vi.fn(),
      readSkillContent: vi.fn().mockReturnValue(undefined),
      hasSnapshot: vi.fn().mockReturnValue(false),
      freezeSnapshot: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({ memories: [], skills: [] }),
    };
    const decideReview = vi.fn().mockReturnValue({
      shouldReview: true,
      reasonCodes: ["retry-amplifier"],
      complexityScore: 3,
    });
    const runSilentReview = vi.fn();

    const engine = createHermesLearningEngine({
      store: store as never,
      reviewThresholds: {
        toolCallCandidateThreshold: 6,
        toolCallForceThreshold: 10,
        cooldownTurns: 2,
        retryWeight: 1,
        rerouteWeight: 1,
        userCorrectionWeight: 1,
        minMemoryConfidence: 0.5,
        minSkillConfidence: 0.6,
      },
      decideReview,
      runSilentReview,
    });

    await engine.afterTurn?.({
      sessionId: "s1:review",
      sessionFile: "/tmp/review-session.jsonl",
      messages: [{ role: "user", content: "这里发生过一次重试、一次改道、一次纠正。" }] as never[],
      prePromptMessageCount: 0,
    });

    expect(decideReview).not.toHaveBeenCalled();
    expect(runSilentReview).not.toHaveBeenCalled();
    expect(store.saveReview).not.toHaveBeenCalled();
  });

  it("filters bootstrap noise out of the review summary and keeps the substantive task", async () => {
    const store = {
      listRecentMemories: vi.fn().mockReturnValue([]),
      listActiveSkills: vi.fn().mockReturnValue([]),
      listAllActiveSkills: vi.fn().mockReturnValue([]),
      saveReview: vi.fn().mockReturnValue("review_1"),
      incrementHitCount: vi.fn(),
      recordSkillOutcome: vi.fn(),
      readSkillContent: vi.fn().mockReturnValue(undefined),
      hasSnapshot: vi.fn().mockReturnValue(false),
      freezeSnapshot: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({ memories: [], skills: [] }),
    };
    const buildReviewPrompt = vi.fn().mockReturnValue("review prompt");

    const engine = createHermesLearningEngine({
      store: store as never,
      reviewThresholds: {
        toolCallCandidateThreshold: 1,
        toolCallForceThreshold: 1,
        cooldownTurns: 0,
        retryWeight: 1,
        rerouteWeight: 1,
        userCorrectionWeight: 1,
        minMemoryConfidence: 0.5,
        minSkillConfidence: 0.6,
      },
      decideReview: vi.fn().mockReturnValue({
        shouldReview: true,
        reasonCodes: ["tool-call-force-threshold"],
        complexityScore: 11,
      }),
      buildReviewPrompt,
      runSilentReview: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          summary: "learned dinner-choice rubric",
          memoryCandidates: [],
          skillCandidates: [],
          dedupeHints: [],
          reuseConfidence: 0.88,
        }),
      }),
    });

    await engine.afterTurn?.({
      sessionId: "s2",
      sessionFile: "/tmp/session.jsonl",
      messages: [
        { role: "tool", name: "read", content: "{\"path\":\"/root/.openclaw/workspace/SOUL.md\"}" },
        {
          role: "toolResult",
          name: "read",
          content:
            "# SOUL.md - Who You Are\nYou're not a chatbot. You're becoming someone.",
        },
        {
          role: "toolResult",
          name: "read",
          content:
            "{\"status\":\"error\",\"tool\":\"read\",\"error\":\"ENOENT: no such file or directory, access '/root/.openclaw/workspace/memory/2026-04-12.md'\"}",
        },
        {
          role: "user",
          content: "帮我挑一个当天来回、不太累、花费别太高的去处，并说说你怎么取舍。",
        },
        { role: "tool", name: "web_search", content: "{\"q\":\"杭州 周末 一日往返 景点\"}" },
        {
          role: "assistant",
          content: "我会优先比较交通时间、预算和体力负担，再给你一个简短建议。",
        },
      ] as never[],
      prePromptMessageCount: 0,
    });

    expect(buildReviewPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationSummary: expect.stringContaining("帮我挑一个当天来回、不太累、花费别太高的去处"),
      }),
    );
    expect(buildReviewPrompt.mock.calls[0]?.[0]?.conversationSummary).toContain("web_search");
    expect(buildReviewPrompt.mock.calls[0]?.[0]?.conversationSummary).not.toContain("SOUL.md");
    expect(buildReviewPrompt.mock.calls[0]?.[0]?.conversationSummary).not.toContain("ENOENT");
  });
});
