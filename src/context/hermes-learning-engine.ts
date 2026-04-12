import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssembleResult, ContextEngine, IngestResult } from "openclaw/plugin-sdk";
import { buildGrowthPromptAddition } from "../growth/growth-recall.js";
import { applyGrowthResult } from "../growth/growth-writer.js";
import { buildReviewPrompt } from "../review/review-prompt.js";
import { runReviewWorker } from "../review/review-worker.js";
import { LearningStore } from "../store/learning-store.js";
import { decideReview } from "../trigger/review-trigger.js";

type ReviewThresholdConfig = {
  toolCallCandidateThreshold: number;
  toolCallForceThreshold: number;
  cooldownTurns: number;
  retryWeight: number;
  rerouteWeight: number;
  userCorrectionWeight: number;
};

type HermesLearningEngineOptions = {
  store?: LearningStore;
  resolveStore?: (params: { sessionId: string; sessionKey?: string }) => LearningStore;
  reviewThresholds: ReviewThresholdConfig;
  decideReview?: typeof decideReview;
  buildReviewPrompt?: typeof buildReviewPrompt;
  runSilentReview: (params: {
    prompt: string;
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
  }) => Promise<{ text: string }>;
  applyGrowthResult?: typeof applyGrowthResult;
  buildGrowthPromptAddition?: typeof buildGrowthPromptAddition;
  onReviewError?: (error: unknown) => void;
};

export function createHermesLearningEngine(
  options: HermesLearningEngineOptions,
): ContextEngine {
  const lastReviewTurnIndexes = new Map<string, number>();

  return {
    info: {
      id: "hermes-learning",
      name: "Hermes Learning",
      ownsCompaction: false,
    },
    async ingest(): Promise<IngestResult> {
      return { ingested: false };
    },
    async compact() {
      return {
        ok: true,
        compacted: false,
        reason: "delegated-to-runtime",
      };
    },
    async assemble(params): Promise<AssembleResult> {
      const store = resolveStore(options, params);
      const memories = store.listRecentMemories();
      const skills = store.listActiveSkills();

      return {
        messages: params.messages,
        estimatedTokens: estimateTokens(params.messages),
        systemPromptAddition: (options.buildGrowthPromptAddition ??
          buildGrowthPromptAddition)({
          memories,
          skills,
        }),
      };
    },
    async afterTurn(params) {
      try {
        const store = resolveStore(options, params);
        const toolCalls = params.messages.filter(isToolLikeMessage);
        const turnKey = params.sessionKey ?? params.sessionId;
        const decision = (options.decideReview ?? decideReview)(
          {
            toolCalls: toolCalls.length,
            uniqueTools: new Set(toolCalls.map((message) => readToolName(message))).size,
            retries: countMatches(params.messages, /retry|重试/giu),
            reroutes: countMatches(params.messages, /reroute|改道|换一种/giu),
            userCorrections: countMatches(params.messages, /不对|纠正|应该是|改成/giu),
            turnIndex: params.prePromptMessageCount + params.messages.length,
            lastReviewTurnIndex: lastReviewTurnIndexes.get(turnKey),
          },
          options.reviewThresholds,
        );

        if (!decision.shouldReview) {
          return;
        }

        const prompt = (options.buildReviewPrompt ?? buildReviewPrompt)({
          conversationSummary: summarizeMessages(params.messages),
          reasonCodes: decision.reasonCodes,
        });

        const result = await runReviewWorker({
          prompt,
          runSilentSubagent: ({ prompt: reviewPrompt }) =>
            options.runSilentReview({
              prompt: reviewPrompt,
              sessionId: params.sessionId,
              sessionKey: params.sessionKey,
              sessionFile: params.sessionFile,
            }),
        });

        const reviewId = store.saveReview({
          summary: result.summary,
          complexityScore: decision.complexityScore,
          reasonCodes: decision.reasonCodes,
          rawResult: result,
        });

        (options.applyGrowthResult ?? applyGrowthResult)({
          store,
          reviewId,
          result,
        });

        lastReviewTurnIndexes.set(
          turnKey,
          params.prePromptMessageCount + params.messages.length,
        );
      } catch (error) {
        options.onReviewError?.(error);
      }
    },
  };
}

function resolveStore(
  options: HermesLearningEngineOptions,
  params: { sessionId: string; sessionKey?: string },
) {
  if (options.resolveStore) {
    return options.resolveStore(params);
  }
  if (options.store) {
    return options.store;
  }
  throw new Error("HermesLearningEngine requires store or resolveStore");
}

function summarizeMessages(messages: AgentMessage[]) {
  return messages
    .map((message) => {
      const role = readMessageRole(message);
      const header = isToolLikeMessage(message) ? `${role}:${readToolName(message)}` : role;
      const content = readMessageContent(message);
      return `${header} ${content}`.trim();
    })
    .join("\n")
    .slice(0, 4000);
}

function estimateTokens(messages: AgentMessage[]) {
  const text = summarizeMessages(messages);
  return Math.max(1, Math.ceil(text.length / 4));
}

function countMatches(messages: AgentMessage[], pattern: RegExp) {
  return messages.reduce((count, message) => {
    const content = readMessageContent(message);
    return count + (content.match(pattern)?.length ?? 0);
  }, 0);
}

function isToolLikeMessage(message: AgentMessage) {
  const role = readMessageRole(message);
  return role === "tool" || role === "toolResult";
}

function readToolName(message: AgentMessage) {
  const record = message as unknown as Record<string, unknown>;
  const directName = record.name;
  if (typeof directName === "string" && directName.trim()) {
    return directName;
  }
  const toolName = record.toolName;
  if (typeof toolName === "string" && toolName.trim()) {
    return toolName;
  }
  return "unknown";
}

function readMessageRole(message: AgentMessage) {
  const role = (message as unknown as Record<string, unknown>).role;
  return typeof role === "string" ? role : "unknown";
}

function readMessageContent(message: AgentMessage) {
  const content = (message as unknown as Record<string, unknown>).content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return JSON.stringify(item);
        }
        const record = item as Record<string, unknown>;
        if (typeof record.text === "string") {
          return record.text;
        }
        if (typeof record.thinking === "string") {
          return record.thinking;
        }
        return JSON.stringify(item);
      })
      .join("\n");
  }
  return JSON.stringify(content);
}
