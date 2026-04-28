import fs from "node:fs";
import path from "node:path";
import { pluginConfigSchema } from "./config.js";
import { createHermesLearningEngine } from "./context/hermes-learning-engine.js";
import { resolveLearningPaths } from "./runtime/paths.js";
import { LearningStore } from "./store/learning-store.js";
const pluginDefinition = {
    id: "hermes-learning",
    name: "Hermes Learning",
    description: "Hermes-style learning loop plugin for OpenClaw",
    kind: "context-engine",
    configSchema: createPluginConfigSchema(),
    register(api) {
        const pluginConfig = pluginConfigSchema.parse(api.pluginConfig ?? {});
        api.registerContextEngine("hermes-learning", () => {
            const stores = new Map();
            // 解析全局 state 目录（使用 main agent 的 workspace）
            const globalStateDir = pluginConfig.store.useGlobalState
                ? path.join(api.runtime.agent.resolveAgentWorkspaceDir(api.config, "main"), pluginConfig.store.rootDirName)
                : undefined;
            return createHermesLearningEngine({
                reviewThresholds: pluginConfig.review,
                resolveStore(params) {
                    const agentId = resolveAgentId(params.sessionKey, api.config);
                    const cached = stores.get(agentId);
                    if (cached) {
                        return cached;
                    }
                    const agentWorkspaceDir = api.runtime.agent.resolveAgentWorkspaceDir(api.config, agentId);
                    const paths = resolveLearningPaths({
                        agentWorkspaceDir,
                        rootDirName: pluginConfig.store.rootDirName,
                        skillsDirName: pluginConfig.store.skillsDirName,
                        globalStateDir,
                    });
                    const store = new LearningStore(paths);
                    store.initialize();
                    api.logger.info(`Hermes learning initialized store for agent ${agentId} at ${paths.rootDir} (state: ${paths.stateFile})`);
                    stores.set(agentId, store);
                    return store;
                },
                runSilentReview: async (params) => {
                    const agentId = resolveAgentId(params.sessionKey, api.config);
                    const agentWorkspaceDir = api.runtime.agent.resolveAgentWorkspaceDir(api.config, agentId);
                    const storeRootDir = path.join(agentWorkspaceDir, pluginConfig.store.rootDirName);
                    const reviewSessionFile = buildReviewSessionFile({
                        rootDir: storeRootDir,
                        sessionId: params.sessionId,
                    });
                    fs.mkdirSync(path.dirname(reviewSessionFile), { recursive: true });
                    // Session 文件滚动：超过 100KB 则归档旧文件
                    if (fs.existsSync(reviewSessionFile)) {
                        const stats = fs.statSync(reviewSessionFile);
                        const maxSizeBytes = 100 * 1024; // 100KB
                        if (stats.size > maxSizeBytes) {
                            const archivePath = `${reviewSessionFile}.archived-${Date.now()}`;
                            fs.renameSync(reviewSessionFile, archivePath);
                            // 新的 review 将创建新文件
                        }
                    }
                    const reviewModel = resolveReviewModelCompat({
                        config: api.config,
                        agentId,
                        fallbackProvider: api.runtime.agent.defaults.provider,
                        fallbackModel: api.runtime.agent.defaults.model,
                    });
                    const result = await api.runtime.agent.runEmbeddedPiAgent({
                        sessionId: `${params.sessionId}:review`,
                        sessionKey: buildReviewSessionKey({
                            agentId,
                            sessionId: params.sessionId,
                            sessionKey: params.sessionKey,
                        }),
                        agentId,
                        messageProvider: "memory",
                        trigger: "memory",
                        sessionFile: reviewSessionFile,
                        workspaceDir: agentWorkspaceDir,
                        config: api.config,
                        prompt: params.prompt,
                        provider: reviewModel.provider,
                        model: reviewModel.model,
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
                        api.logger.info(`Hermes learning review skipped for session ${params.sessionId}: toolCalls=${params.toolCalls}, score=${params.complexityScore}, reasons=${params.reasonCodes.join(",") || "none"}`);
                        return;
                    }
                    api.logger.info(`Hermes learning review triggered for session ${params.sessionId}: toolCalls=${params.toolCalls}, score=${params.complexityScore}, reasons=${params.reasonCodes.join(",")}, store=${params.storeDir}`);
                },
                onReviewCompleted(params) {
                    api.logger.info(`Hermes learning review completed for session ${params.sessionId}: reviewId=${params.reviewId}, memories=${params.memoryCount}, skills=${params.skillCount}, store=${params.storeDir}, summary=${params.summary}`);
                },
                onReviewError(error) {
                    api.logger.warn(`Hermes learning review failed: ${error instanceof Error ? error.message : String(error)}`);
                },
            });
        });
    },
};
export default pluginDefinition;
function resolveAgentId(sessionKey, config) {
    const sessionAgentId = resolveAgentIdFromSessionKeyCompat(sessionKey);
    if (sessionAgentId && sessionAgentId !== "main") {
        return sessionAgentId;
    }
    return resolveDefaultAgentIdCompat(config);
}
function extractReviewText(result) {
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
function buildReviewSessionKey(params) {
    const reviewSuffix = `hermes-review:${params.sessionId}`;
    const parentSessionKey = params.sessionKey?.trim();
    if (parentSessionKey) {
        return `${parentSessionKey}:${reviewSuffix}`;
    }
    return `agent:${params.agentId}:${reviewSuffix}`;
}
function buildReviewSessionFile(params) {
    return path.join(params.rootDir, "review-sessions", `${sanitizePathSegment(`${params.sessionId}-review`)}.jsonl`);
}
function resolveReviewModelCompat(params) {
    const configured = readConfiguredAgentModelRef(params.config, params.agentId) ??
        readConfiguredAgentModelRef(params.config, resolveDefaultAgentIdCompat(params.config));
    return parseModelRefCompat(configured, params.fallbackProvider, params.fallbackModel);
}
function resolveAgentIdFromSessionKeyCompat(sessionKey) {
    const trimmed = sessionKey?.trim();
    if (!trimmed) {
        return "main";
    }
    const match = /^agent:([^:]+):/u.exec(trimmed);
    return normalizeAgentIdCompat(match?.[1]);
}
function resolveDefaultAgentIdCompat(config) {
    const record = config;
    const agents = record.agents;
    const list = Array.isArray(agents?.list) ? agents.list : [];
    if (list.length === 0) {
        return "main";
    }
    const normalized = list
        .filter((item) => Boolean(item && typeof item === "object"))
        .map((item) => ({
        id: normalizeAgentIdCompat(item.id),
        isDefault: item.default === true,
    }));
    const selected = normalized.find((item) => item.isDefault) ?? normalized[0];
    return selected?.id ?? "main";
}
function normalizeAgentIdCompat(value) {
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
function readConfiguredAgentModelRef(config, agentId) {
    const record = config;
    const agents = record.agents;
    const list = Array.isArray(agents?.list) ? agents.list : [];
    const matchedAgent = list.find((item) => Boolean(item && typeof item === "object") &&
        normalizeAgentIdCompat(item.id) === normalizeAgentIdCompat(agentId));
    return (readModelSelectionCompat(matchedAgent?.model) ??
        readModelSelectionCompat(agents?.defaults?.model));
}
function readModelSelectionCompat(value) {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const primary = value.primary;
    return typeof primary === "string" && primary.trim() ? primary.trim() : undefined;
}
function parseModelRefCompat(raw, fallbackProvider, fallbackModel) {
    const trimmed = raw?.trim();
    if (!trimmed) {
        return {
            provider: fallbackProvider,
            model: fallbackModel,
        };
    }
    const separator = trimmed.indexOf("/");
    if (separator <= 0 || separator === trimmed.length - 1) {
        return {
            provider: fallbackProvider,
            model: trimmed,
        };
    }
    return {
        provider: trimmed.slice(0, separator),
        model: trimmed.slice(separator + 1),
    };
}
function sanitizePathSegment(value) {
    const normalized = value
        .trim()
        .replace(/[^a-z0-9._-]+/giu, "-")
        .replace(/^-+/u, "")
        .replace(/-+$/u, "");
    return normalized || "session";
}
function createPluginConfigSchema() {
    return {
        safeParse(value) {
            const result = pluginConfigSchema.safeParse(value ?? {});
            if (result.success) {
                return {
                    success: true,
                    data: result.data,
                };
            }
            return {
                success: false,
                error: {
                    issues: result.error.issues.map((issue) => ({
                        path: issue.path.filter((segment) => typeof segment === "string" || typeof segment === "number"),
                        message: issue.message,
                    })),
                },
            };
        },
        jsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
                review: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        toolCallCandidateThreshold: { type: "integer", minimum: 1 },
                        toolCallForceThreshold: { type: "integer", minimum: 1 },
                        cooldownTurns: { type: "integer", minimum: 0 },
                        retryWeight: { type: "number", minimum: 0 },
                        rerouteWeight: { type: "number", minimum: 0 },
                        userCorrectionWeight: { type: "number", minimum: 0 },
                    },
                },
                store: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        rootDirName: { type: "string", minLength: 1 },
                        skillsDirName: { type: "string", minLength: 1 },
                    },
                },
            },
        },
    };
}
