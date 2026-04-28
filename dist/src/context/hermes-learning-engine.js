import { buildGrowthPromptAddition } from "../growth/growth-recall.js";
import { applyGrowthResult } from "../growth/growth-writer.js";
import { advanceSkillLifecycle } from "../growth/skill-lifecycle.js";
import { buildReviewPrompt } from "../review/review-prompt.js";
import { runReviewWorker } from "../review/review-worker.js";
import { decideReview } from "../trigger/review-trigger.js";
export function createHermesLearningEngine(options) {
    const lastReviewTurnIndexes = new Map();
    return {
        info: {
            id: "hermes-learning",
            name: "Hermes Learning",
            ownsCompaction: false,
        },
        async ingest() {
            return { ingested: false };
        },
        async compact() {
            return {
                ok: true,
                compacted: false,
                reason: "delegated-to-runtime",
            };
        },
        async assemble(params) {
            const store = resolveStore(options, params);
            if (!store.hasSnapshot()) {
                store.freezeSnapshot();
            }
            const snapshot = store.getSnapshot();
            const memories = snapshot.memories;
            const userQuery = extractUserQuery(params.messages);
            const allSkills = snapshot.skills;
            const scoredSkills = allSkills
                .map((skill) => ({
                skill,
                relevance: scoreSkillRelevance(skill, userQuery),
            }))
                .sort((a, b) => b.relevance - a.relevance)
                .slice(0, 5)
                .map((item) => item.skill);
            for (const skill of scoredSkills) {
                store.incrementHitCount(skill.slug);
            }
            const skillsWithContent = scoredSkills.map((skill) => ({
                ...skill,
                content: skill.state === "promoted" ? store.readSkillContent(skill.slug) : undefined,
            }));
            return {
                messages: params.messages,
                estimatedTokens: estimateTokens(params.messages),
                systemPromptAddition: (options.buildGrowthPromptAddition ??
                    buildGrowthPromptAddition)({
                    memories,
                    skills: skillsWithContent,
                }),
            };
        },
        async afterTurn(params) {
            try {
                if (isReviewWorkerSession(params.sessionId)) {
                    return;
                }
                const store = resolveStore(options, params);
                const toolCalls = params.messages.filter(isToolLikeMessage);
                const turnKey = params.sessionKey ?? params.sessionId;
                const decision = (options.decideReview ?? decideReview)({
                    toolCalls: toolCalls.length,
                    uniqueTools: new Set(toolCalls.map((message) => readToolName(message))).size,
                    retries: countMatches(params.messages, /retry|重试/giu),
                    reroutes: countMatches(params.messages, /reroute|改道|换一种/giu),
                    userCorrections: countMatches(params.messages, /不对|纠正|应该是|改成|错了|重新来|no[,.\s]|wrong|not right|actually[,.\s]|instead[,.\s]|rather[,.\s]|correct(?:ion)?|redo|try again|再试/giu),
                    turnIndex: params.prePromptMessageCount + params.messages.length,
                    lastReviewTurnIndex: lastReviewTurnIndexes.get(turnKey),
                }, options.reviewThresholds);
                options.onReviewDecision?.({
                    sessionId: params.sessionId,
                    sessionKey: params.sessionKey,
                    storeDir: store.getPaths().rootDir,
                    shouldReview: decision.shouldReview,
                    reasonCodes: decision.reasonCodes,
                    complexityScore: decision.complexityScore,
                    toolCalls: toolCalls.length,
                });
                if (!decision.shouldReview) {
                    return;
                }
                const existingMemories = store.listRecentMemories();
                const existingSkills = store.listActiveSkills();
                const prompt = (options.buildReviewPrompt ?? buildReviewPrompt)({
                    conversationSummary: summarizeMessages(params.messages),
                    reasonCodes: decision.reasonCodes,
                    existingMemories,
                    existingSkills,
                });
                const result = await runReviewWorker({
                    prompt,
                    runSilentSubagent: ({ prompt: reviewPrompt }) => options.runSilentReview({
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
                    minMemoryConfidence: options.reviewThresholds.minMemoryConfidence,
                    minSkillConfidence: options.reviewThresholds.minSkillConfidence,
                });
                options.onReviewCompleted?.({
                    sessionId: params.sessionId,
                    sessionKey: params.sessionKey,
                    storeDir: store.getPaths().rootDir,
                    reviewId,
                    memoryCount: result.memoryCandidates.length,
                    skillCount: result.skillCandidates.length,
                    summary: result.summary,
                });
                lastReviewTurnIndexes.set(turnKey, params.prePromptMessageCount + params.messages.length);
                // 触发 skill 生命周期流转
                advanceSkillLifecycle(store);
            }
            catch (error) {
                options.onReviewError?.(error);
            }
        },
    };
}
function resolveStore(options, params) {
    if (options.resolveStore) {
        return options.resolveStore(params);
    }
    if (options.store) {
        return options.store;
    }
    throw new Error("HermesLearningEngine requires store or resolveStore");
}
function isReviewWorkerSession(sessionId) {
    return sessionId.endsWith(":review");
}
function summarizeMessages(messages) {
    const lines = messages
        .map((message) => summarizeMessageForReview(message))
        .filter((line) => Boolean(line));
    if (lines.length === 0) {
        return "";
    }
    // 保留首条消息 + 最后 18 条消息
    const first = lines[0];
    const tail = lines.slice(-18);
    const combined = lines.length <= 19 ? lines : [first, ...tail];
    const joined = combined.join("\n");
    return joined.length <= 4000 ? joined : joined.slice(-4000);
}
function estimateTokens(messages) {
    const text = summarizeMessages(messages);
    return Math.max(1, Math.ceil(text.length / 4));
}
function countMatches(messages, pattern) {
    return messages.reduce((count, message) => {
        const content = readMessageContent(message);
        return count + (content.match(pattern)?.length ?? 0);
    }, 0);
}
function isToolLikeMessage(message) {
    const role = readMessageRole(message);
    return role === "tool" || role === "toolResult";
}
function summarizeMessageForReview(message) {
    const role = readMessageRole(message);
    const header = isToolLikeMessage(message) ? `${role}:${readToolName(message)}` : role;
    const content = normalizeWhitespace(readMessageContent(message));
    if (!content) {
        return null;
    }
    if (shouldSkipSummaryMessage(message, content)) {
        return null;
    }
    const summarizedContent = isToolLikeMessage(message)
        ? summarizeToolLikeContent(content)
        : truncateForSummary(content, 220);
    if (!summarizedContent) {
        return null;
    }
    return `${header} ${summarizedContent}`.trim();
}
function shouldSkipSummaryMessage(message, content) {
    if (isToolLikeMessage(message)) {
        const paths = extractPaths(content);
        if (paths.length > 0 && paths.every((value) => isBootstrapNoisePath(value))) {
            return true;
        }
    }
    if (isBootstrapNoiseContent(content)) {
        return true;
    }
    if (isToolLikeMessage(message) && /web-tools guidance|web tools guidance/iu.test(content)) {
        return true;
    }
    return false;
}
function summarizeToolLikeContent(content) {
    const paths = extractPaths(content)
        .filter((value) => !isBootstrapNoisePath(value))
        .slice(0, 3);
    if (paths.length > 0) {
        return paths.join(", ");
    }
    return truncateForSummary(content, 160);
}
function normalizeWhitespace(value) {
    return value.replace(/\s+/gu, " ").trim();
}
function truncateForSummary(value, maxChars) {
    if (value.length <= maxChars) {
        return value;
    }
    return `${value.slice(0, maxChars - 1)}…`;
}
function extractPaths(content) {
    const results = new Set();
    for (const match of content.matchAll(/"(?:path|file_path|cwd)"\s*:\s*"([^"]+)"/gu)) {
        const candidate = match[1]?.trim();
        if (candidate) {
            results.add(candidate);
        }
    }
    for (const match of content.matchAll(/(\/[A-Za-z0-9._\-\/]+(?:\.[A-Za-z0-9._-]+)?)/gu)) {
        const candidate = match[1]?.trim();
        if (candidate) {
            results.add(candidate);
        }
    }
    return [...results];
}
function isBootstrapNoiseContent(content) {
    return (isBootstrapNoisePath(content) ||
        /#\s*(?:SOUL\.md|USER\.md|MEMORY\.md)\b/iu.test(content) ||
        /ENOENT: no such file or directory.*(?:SOUL\.md|USER\.md|MEMORY\.md|\/memory\/\d{4}-\d{2}-\d{2}\.md)/iu.test(content));
}
function isBootstrapNoisePath(value) {
    return /(?:^|\/)(?:SOUL\.md|USER\.md|MEMORY\.md)$/iu.test(value)
        || /\/memory\/\d{4}-\d{2}-\d{2}\.md$/u.test(value);
}
function readToolName(message) {
    const record = message;
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
function readMessageRole(message) {
    const role = message.role;
    return typeof role === "string" ? role : "unknown";
}
function readMessageContent(message) {
    const content = message.content;
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((item) => {
            if (!item || typeof item !== "object") {
                return JSON.stringify(item);
            }
            const record = item;
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
function extractUserQuery(messages) {
    const userMessages = messages
        .filter((m) => readMessageRole(m) === "user")
        .map((m) => readMessageContent(m));
    const last = userMessages[userMessages.length - 1] ?? "";
    return last.slice(0, 500);
}
function scoreSkillRelevance(skill, userQuery) {
    if (!userQuery)
        return 0;
    const stateBonus = skill.state === "promoted" ? 0.2 : 0;
    const queryTokens = tokenize(userQuery);
    const skillTokens = tokenize(`${skill.slug.replace(/-/g, " ")} ${skill.summary}`);
    if (queryTokens.size === 0 || skillTokens.size === 0)
        return stateBonus;
    let overlap = 0;
    for (const token of queryTokens) {
        if (skillTokens.has(token))
            overlap++;
    }
    return overlap / Math.max(queryTokens.size, 1) + stateBonus;
}
function tokenize(text) {
    const tokens = new Set();
    for (const match of text.toLowerCase().matchAll(/[a-z]{2,}/gu)) {
        tokens.add(match[0]);
    }
    const cjk = text.replace(/[^一-鿿]/gu, "");
    for (let i = 0; i < cjk.length - 1; i++) {
        tokens.add(cjk.slice(i, i + 2));
    }
    for (const char of cjk) {
        tokens.add(char);
    }
    return tokens;
}
