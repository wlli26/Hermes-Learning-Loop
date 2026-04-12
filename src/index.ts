import path from "node:path";
import { buildPluginConfigSchema, definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { pluginConfigSchema } from "./config.js";
import { createHermesLearningEngine } from "./context/hermes-learning-engine.js";
import { resolveLearningPaths } from "./runtime/paths.js";
import { LearningStore } from "./store/learning-store.js";

export default definePluginEntry({
  id: "hermes-learning",
  name: "Hermes Learning",
  description: "Hermes-style learning loop plugin for OpenClaw",
  kind: "context-engine",
  configSchema: () => buildPluginConfigSchema(pluginConfigSchema as never),
  register(api) {
    const pluginConfig = pluginConfigSchema.parse(api.pluginConfig ?? {});

    api.registerContextEngine("hermes-learning", () => {
      const stores = new Map<string, LearningStore>();

      return createHermesLearningEngine({
        reviewThresholds: pluginConfig.review,
        resolveStore(params) {
          const agentId = resolveAgentId(params.sessionKey, api.config);
          const cached = stores.get(agentId);
          if (cached) {
            return cached;
          }

          const agentWorkspaceDir = api.runtime.agent.resolveAgentWorkspaceDir(
            api.config,
            agentId,
          );
          const paths = resolveLearningPaths({
            agentWorkspaceDir,
            rootDirName: pluginConfig.store.rootDirName,
          });
          const store = new LearningStore(paths);
          store.initialize();
          api.logger.info(
            `Hermes learning initialized store for agent ${agentId} at ${paths.rootDir}`,
          );
          stores.set(agentId, store);
          return store;
        },
        runSilentReview: async (params) => {
          const agentId = resolveAgentId(params.sessionKey, api.config);
          const agentWorkspaceDir = api.runtime.agent.resolveAgentWorkspaceDir(
            api.config,
            agentId,
          );
          const storeRootDir = path.join(
            agentWorkspaceDir,
            pluginConfig.store.rootDirName,
          );
          const result = await api.runtime.agent.runEmbeddedPiAgent({
            sessionId: `${params.sessionId}:review`,
            sessionKey: params.sessionKey,
            agentId,
            messageProvider: "memory",
            trigger: "memory",
            sessionFile:
              params.sessionFile ?? path.join(storeRootDir, "review-session.jsonl"),
            workspaceDir: agentWorkspaceDir,
            config: api.config,
            prompt: params.prompt,
            provider: api.runtime.agent.defaults.provider,
            model: api.runtime.agent.defaults.model,
            verboseLevel: "off",
            timeoutMs: api.runtime.agent.resolveAgentTimeoutMs({ cfg: api.config }),
            runId: `hermes-review:${params.sessionId}:${Date.now()}`,
            lane: "memory",
            disableTools: true,
            silentExpected: true,
            extraSystemPrompt: [
              "You are a silent review worker for OpenClaw.",
              "Return strict JSON only.",
              "Do not include markdown fences or commentary.",
            ].join(" "),
          });

          return {
            text: extractReviewText(result),
          };
        },
        onReviewDecision(params) {
          if (!params.shouldReview) {
            api.logger.info(
              `Hermes learning review skipped for session ${params.sessionId}: toolCalls=${params.toolCalls}, score=${params.complexityScore}, reasons=${
                params.reasonCodes.join(",") || "none"
              }`,
            );
            return;
          }
          api.logger.info(
            `Hermes learning review triggered for session ${params.sessionId}: toolCalls=${params.toolCalls}, score=${params.complexityScore}, reasons=${params.reasonCodes.join(",")}, store=${params.storeDir}`,
          );
        },
        onReviewCompleted(params) {
          api.logger.info(
            `Hermes learning review completed for session ${params.sessionId}: reviewId=${params.reviewId}, memories=${params.memoryCount}, skills=${params.skillCount}, store=${params.storeDir}, summary=${params.summary}`,
          );
        },
        onReviewError(error) {
          api.logger.warn(
            `Hermes learning review failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        },
      });
    });
  },
});

function resolveAgentId(sessionKey: string | undefined, config: object) {
  const sessionAgentId = resolveAgentIdFromSessionKeyCompat(sessionKey);
  if (sessionAgentId && sessionAgentId !== "main") {
    return sessionAgentId;
  }
  return resolveDefaultAgentIdCompat(config);
}

function extractReviewText(result: {
  text?: string;
  payloads?: Array<{ text?: string; isReasoning?: boolean; isError?: boolean }>;
  meta?: { finalAssistantVisibleText?: string };
}) {
  if (typeof result.text === "string" && result.text.trim()) {
    return result.text;
  }
  if (typeof result.meta?.finalAssistantVisibleText === "string") {
    return result.meta.finalAssistantVisibleText;
  }
  const payloadText = result.payloads
    ?.filter((payload) => !payload.isReasoning && !payload.isError)
    .map((payload) => payload.text ?? "")
    .join("")
    .trim();

  return payloadText || "{}";
}

function resolveAgentIdFromSessionKeyCompat(sessionKey: string | undefined) {
  const trimmed = sessionKey?.trim();
  if (!trimmed) {
    return "main";
  }
  const match = /^agent:([^:]+):/u.exec(trimmed);
  return normalizeAgentIdCompat(match?.[1]);
}

function resolveDefaultAgentIdCompat(config: object) {
  const record = config as Record<string, unknown>;
  const agents = record.agents as Record<string, unknown> | undefined;
  const list = Array.isArray(agents?.list) ? agents.list : [];
  if (list.length === 0) {
    return "main";
  }

  const normalized = list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      id: normalizeAgentIdCompat(item.id),
      isDefault: item.default === true,
    }));

  const selected = normalized.find((item) => item.isDefault) ?? normalized[0];
  return selected?.id ?? "main";
}

function normalizeAgentIdCompat(value: unknown) {
  if (typeof value !== "string") {
    return "main";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "main";
  }
  const normalized = trimmed
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "")
    .slice(0, 64);

  return normalized || "main";
}
