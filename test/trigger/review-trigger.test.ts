import { describe, expect, it } from "vitest";
import { decideReview } from "../../src/trigger/review-trigger.js";

describe("decideReview", () => {
  it("forces review at tool-call force threshold", () => {
    const result = decideReview(
      {
        toolCalls: 10,
        uniqueTools: 3,
        retries: 0,
        reroutes: 0,
        userCorrections: 0,
        turnIndex: 12,
      },
      {
        toolCallCandidateThreshold: 6,
        toolCallForceThreshold: 10,
        cooldownTurns: 2,
        retryWeight: 1,
        rerouteWeight: 1,
        userCorrectionWeight: 1,
      },
    );

    expect(result.shouldReview).toBe(true);
    expect(result.reasonCodes).toContain("tool-call-force-threshold");
  });

  it("blocks review during cooldown", () => {
    const result = decideReview(
      {
        toolCalls: 11,
        uniqueTools: 4,
        retries: 1,
        reroutes: 1,
        userCorrections: 0,
        turnIndex: 5,
        lastReviewTurnIndex: 4,
      },
      {
        toolCallCandidateThreshold: 6,
        toolCallForceThreshold: 10,
        cooldownTurns: 2,
        retryWeight: 1,
        rerouteWeight: 1,
        userCorrectionWeight: 1,
      },
    );

    expect(result.shouldReview).toBe(false);
    expect(result.reasonCodes).toContain("cooldown-blocked");
  });
});
