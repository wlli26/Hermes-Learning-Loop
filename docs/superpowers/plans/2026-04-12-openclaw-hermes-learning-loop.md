# OpenClaw Hermes Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯 OpenClaw 外部插件，在不依赖 Hermes sidecar（旁路服务）的前提下，实现按 agent 隔离、阈值触发、后台复盘、自动写 memory（记忆）与 candidate skill（候选技能）、下轮按需召回的 Hermes 风格 learning loop（学习闭环）。

**Architecture:** 插件以 TypeScript（首次出现，TypeScript，类型脚本）实现，主体注册 `context-engine` 承接 `afterTurn` 和 `assemble` 生命周期，并辅以少量 plugin hook（插件钩子）补充统计信号。内部拆成 `LearningStore`、`ReviewTrigger`、`ReviewWorker`、`GrowthWriter`、`GrowthRecall` 五个模块，所有自动成长数据写入 agent 私有 `.openclaw-hermes/` 目录，并通过 `state.json`、`reviews/*.json` 和 `learning-log.jsonl` 支持状态流转、审计与去重。

**Tech Stack:** Node.js 22、TypeScript、OpenClaw Plugin SDK、Vitest、zod、jiti 兼容的 ESM（模块系统）

---

## File Structure

本仓库当前只有设计文档，因此实现按“独立外部插件工程”组织。下面是首版要创建或修改的文件，以及每个文件的职责。

- Create: `package.json`
  - 定义插件包元数据、脚本、依赖、 OpenClaw 兼容字段
- Create: `tsconfig.json`
  - TypeScript 编译配置
- Create: `vitest.config.ts`
  - 测试配置
- Create: `openclaw.plugin.json`
  - 插件 manifest（清单）
- Create: `src/index.ts`
  - 插件入口，注册 `context-engine` 与 hook
- Create: `src/config.ts`
  - 插件配置 schema（模式）与默认值
- Create: `src/runtime/paths.ts`
  - `.openclaw-hermes/` 目录与 agent 路径解析
- Create: `src/store/learning-store.ts`
  - review、memory、skill、audit、state 的文件持久化接口
- Create: `src/trigger/review-trigger.ts`
  - 复杂度计分、阈值判断、冷却逻辑
- Create: `src/review/review-prompt.ts`
  - 后台复盘 prompt 构造
- Create: `src/review/review-worker.ts`
  - 静默后台 review 调度与结果解析
- Create: `src/growth/growth-writer.ts`
  - memory/skill 写入、去重、生命周期状态转换
- Create: `src/growth/growth-recall.ts`
  - 按需召回成长结果并生成 `systemPromptAddition`
- Create: `src/context/hermes-learning-engine.ts`
  - `context-engine` 实现，组合 `afterTurn` 与 `assemble`
- Create: `src/types.ts`
  - 插件内部共享类型
- Create: `test/helpers/temp-agent.ts`
  - agent 临时目录测试辅助
- Create: `test/store/learning-store.test.ts`
  - `LearningStore` 单测
- Create: `test/trigger/review-trigger.test.ts`
  - 复杂度与冷却逻辑单测
- Create: `test/review/review-worker.test.ts`
  - review worker 行为单测
- Create: `test/growth/growth-writer.test.ts`
  - memory/skill 写入与状态流转单测
- Create: `test/growth/growth-recall.test.ts`
  - 召回与 prompt 注入单测
- Create: `test/context/hermes-learning-engine.test.ts`
  - `context-engine` 集成单测
- Create: `README.md`
  - 安装、配置、开发与限制说明
- Create: `.gitignore`
  - 忽略 `node_modules`、构建产物和本地状态文件

## Task 1: Scaffold Plugin Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `openclaw.plugin.json`
- Create: `.gitignore`
- Test: `package.json`

- [ ] **Step 1: 写入插件包元数据与脚本**

```json
{
  "name": "@hygao1024/openclaw-hermes-learning",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^22.15.3",
    "typescript": "^5.8.3",
    "vitest": "^3.1.2"
  },
  "dependencies": {
    "openclaw": "^2026.3.24-beta.2",
    "zod": "^3.24.3"
  },
  "openclaw": {
    "extensions": [
      "./src/index.ts"
    ],
    "compat": {
      "pluginApi": ">=2026.3.24-beta.2",
      "minGatewayVersion": "2026.3.24-beta.2"
    },
    "build": {
      "openclawVersion": "2026.3.24-beta.2",
      "pluginSdkVersion": "2026.3.24-beta.2"
    }
  }
}
```

- [ ] **Step 2: 写入 TypeScript 配置**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"],
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: 写入 Vitest 配置**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
```

- [ ] **Step 4: 写入插件 manifest 与 `.gitignore`**

```json
{
  "id": "hermes-learning",
  "name": "Hermes Learning",
  "description": "Hermes-style learning loop plugin for OpenClaw",
  "configSchema": {
    "type": "object",
    "additionalProperties": false
  }
}
```

```gitignore
node_modules
dist
coverage
.DS_Store
```

- [ ] **Step 5: 运行依赖安装并验证基础脚手架**

Run: `npm install`
Expected: 成功安装依赖，生成 `node_modules/`

- [ ] **Step 6: 运行空测试验证脚手架可用**

Run: `npm test`
Expected: `No test files found` 或 0 个测试通过，命令本身成功退出

- [ ] **Step 7: Commit**

```bash
git add .gitignore openclaw.plugin.json package.json tsconfig.json vitest.config.ts
git commit -m "初始化 OpenClaw Hermes 学习插件工程"
```

## Task 2: Define Shared Types and Config

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `test/context/config.test.ts`

- [ ] **Step 1: 写配置测试，锁定默认值与类型边界**

```ts
import { describe, expect, it } from "vitest";
import { defaultPluginConfig, pluginConfigSchema } from "../../src/config.js";

describe("pluginConfigSchema", () => {
  it("provides stable defaults", () => {
    const parsed = pluginConfigSchema.parse({});
    expect(parsed.review.toolCallCandidateThreshold).toBe(6);
    expect(parsed.review.toolCallForceThreshold).toBe(10);
    expect(parsed.review.cooldownTurns).toBe(2);
    expect(parsed.store.rootDirName).toBe(".openclaw-hermes");
  });

  it("rejects invalid cooldown values", () => {
    expect(() =>
      pluginConfigSchema.parse({
        review: { cooldownTurns: -1 },
      }),
    ).toThrow(/cooldown/i);
  });

  it("exports the same defaults object shape", () => {
    expect(defaultPluginConfig.review.toolCallForceThreshold).toBe(10);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/context/config.test.ts`
Expected: FAIL，报错 `Cannot find module '../../src/config.js'` 或导出不存在

- [ ] **Step 3: 写共享类型**

```ts
export type ReviewReasonCode =
  | "tool-call-candidate-threshold"
  | "tool-call-force-threshold"
  | "retry-amplifier"
  | "reroute-amplifier"
  | "user-correction-amplifier"
  | "cooldown-blocked";

export type SkillLifecycleState = "candidate" | "promoted" | "stale" | "deprecated";

export type ReviewComplexityInput = {
  toolCalls: number;
  uniqueTools: number;
  retries: number;
  reroutes: number;
  userCorrections: number;
  turnIndex: number;
  lastReviewTurnIndex?: number;
};

export type ReviewDecision = {
  shouldReview: boolean;
  reasonCodes: ReviewReasonCode[];
  complexityScore: number;
};

export type ReviewCandidateMemory = {
  kind: "durable-memory" | "user-model";
  title: string;
  content: string;
  confidence: number;
};

export type ReviewCandidateSkill = {
  slug: string;
  title: string;
  summary: string;
  content: string;
  confidence: number;
};

export type ReviewResult = {
  summary: string;
  memoryCandidates: ReviewCandidateMemory[];
  skillCandidates: ReviewCandidateSkill[];
  dedupeHints: string[];
  reuseConfidence: number;
};
```

- [ ] **Step 4: 写配置 schema 与默认值**

```ts
import { z } from "zod";

export const pluginConfigSchema = z.object({
  review: z
    .object({
      toolCallCandidateThreshold: z.number().int().min(1).default(6),
      toolCallForceThreshold: z.number().int().min(1).default(10),
      cooldownTurns: z.number().int().min(0).default(2),
      retryWeight: z.number().min(0).default(1),
      rerouteWeight: z.number().min(0).default(1),
      userCorrectionWeight: z.number().min(0).default(1),
    })
    .default({}),
  store: z
    .object({
      rootDirName: z.string().min(1).default(".openclaw-hermes"),
    })
    .default({}),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export const defaultPluginConfig: PluginConfig = pluginConfigSchema.parse({});
```

- [ ] **Step 5: 运行测试并确认通过**

Run: `npm test -- test/context/config.test.ts`
Expected: PASS，3 个测试通过

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/types.ts test/context/config.test.ts
git commit -m "定义学习插件配置与共享类型"
```

## Task 3: Implement Agent-Scoped Path Resolution

**Files:**
- Create: `src/runtime/paths.ts`
- Create: `test/helpers/temp-agent.ts`
- Create: `test/runtime/paths.test.ts`

- [ ] **Step 1: 写路径解析失败测试**

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLearningPaths } from "../../src/runtime/paths.js";

describe("resolveLearningPaths", () => {
  it("builds agent-scoped plugin directories", () => {
    const paths = resolveLearningPaths({
      agentWorkspaceDir: "/tmp/workspaces/main",
      rootDirName: ".openclaw-hermes",
    });

    expect(paths.rootDir).toBe(path.join("/tmp/workspaces/main", ".openclaw-hermes"));
    expect(paths.reviewsDir).toBe(path.join(paths.rootDir, "reviews"));
    expect(paths.skillsDir).toBe(path.join(paths.rootDir, "skills"));
    expect(paths.memoryDir).toBe(path.join(paths.rootDir, "memory"));
    expect(paths.sqliteFile).toBe(path.join(paths.rootDir, "index.sqlite"));
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/runtime/paths.test.ts`
Expected: FAIL，报错缺少 `../../src/runtime/paths.js`

- [ ] **Step 3: 写测试辅助与路径实现**

```ts
export function createTempAgentWorkspace(baseDir: string, agentId = "main") {
  return {
    agentId,
    workspaceDir: `${baseDir}/${agentId}`,
  };
}
```

```ts
import path from "node:path";

export type LearningPaths = {
  rootDir: string;
  reviewsDir: string;
  skillsDir: string;
  memoryDir: string;
  sqliteFile: string;
  auditLogFile: string;
};

export function resolveLearningPaths(params: {
  agentWorkspaceDir: string;
  rootDirName: string;
}): LearningPaths {
  const rootDir = path.join(params.agentWorkspaceDir, params.rootDirName);
  return {
    rootDir,
    reviewsDir: path.join(rootDir, "reviews"),
    skillsDir: path.join(rootDir, "skills"),
    memoryDir: path.join(rootDir, "memory"),
    sqliteFile: path.join(rootDir, "index.sqlite"),
    auditLogFile: path.join(rootDir, "learning-log.jsonl"),
  };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- test/runtime/paths.test.ts`
Expected: PASS，1 个测试通过

- [ ] **Step 5: Commit**

```bash
git add src/runtime/paths.ts test/helpers/temp-agent.ts test/runtime/paths.test.ts
git commit -m "实现按 agent 隔离的学习路径解析"
```

## Task 4: Implement File-Based LearningStore Persistence

**Files:**
- Create: `src/store/learning-store.ts`
- Create: `test/store/learning-store.test.ts`

- [ ] **Step 1: 写持久化测试**

```ts
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
      rawResult: { summary: "learned retry flow", memoryCandidates: [], skillCandidates: [], dedupeHints: [], reuseConfidence: 0.9 },
    });

    expect(reviewId).toMatch(/^review_/);
    expect(fs.existsSync(path.join(root, "state.json"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "learning-log.jsonl"), "utf8")).toContain("tool-call-force-threshold");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/store/learning-store.test.ts`
Expected: FAIL，报错缺少 `LearningStore`

- [ ] **Step 3: 写 `LearningStore` 最小实现**

```ts
import fs from "node:fs";
import path from "node:path";

export class LearningStore {
  constructor(
    private readonly paths: {
      rootDir: string;
      auditLogFile: string;
      reviewsDir: string;
      skillsDir: string;
      memoryDir: string;
      stateFile: string;
    },
  ) {}

  initialize() {
    fs.mkdirSync(this.paths.rootDir, { recursive: true });
    fs.mkdirSync(this.paths.reviewsDir, { recursive: true });
    fs.mkdirSync(this.paths.skillsDir, { recursive: true });
    fs.mkdirSync(this.paths.memoryDir, { recursive: true });
    if (!fs.existsSync(this.paths.stateFile)) {
      fs.writeFileSync(
        this.paths.stateFile,
        JSON.stringify({ skills: {}, memories: {} }, null, 2),
        "utf8",
      );
    }
  }

  getPaths() {
    return this.paths;
  }

  saveReview(params: {
    summary: string;
    complexityScore: number;
    reasonCodes: string[];
    rawResult: unknown;
  }) {
    const reviewId = `review_${Date.now()}`;
    const reviewRecord = {
      reviewId,
      summary: params.summary,
      complexityScore: params.complexityScore,
      reasonCodes: params.reasonCodes,
      rawResult: params.rawResult,
      createdAt: new Date().toISOString(),
    };
    fs.appendFileSync(
      this.paths.auditLogFile,
      `${JSON.stringify(reviewRecord)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(this.paths.reviewsDir, `${reviewId}.json`),
      JSON.stringify(reviewRecord, null, 2),
      "utf8",
    );
    return reviewId;
  }
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- test/store/learning-store.test.ts`
Expected: PASS，1 个测试通过

- [ ] **Step 5: Commit**

```bash
git add src/store/learning-store.ts test/store/learning-store.test.ts
git commit -m "实现学习存储与基础索引持久化"
```

## Task 5: Implement ReviewTrigger Complexity and Cooldown Logic

**Files:**
- Create: `src/trigger/review-trigger.ts`
- Create: `test/trigger/review-trigger.test.ts`

- [ ] **Step 1: 写复杂度与冷却测试**

```ts
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/trigger/review-trigger.test.ts`
Expected: FAIL，报错缺少 `decideReview`

- [ ] **Step 3: 写复杂度决策实现**

```ts
import type { ReviewComplexityInput, ReviewDecision } from "../types.js";

type ReviewThresholdConfig = {
  toolCallCandidateThreshold: number;
  toolCallForceThreshold: number;
  cooldownTurns: number;
  retryWeight: number;
  rerouteWeight: number;
  userCorrectionWeight: number;
};

export function decideReview(
  input: ReviewComplexityInput,
  config: ReviewThresholdConfig,
): ReviewDecision {
  const reasonCodes: ReviewDecision["reasonCodes"] = [];
  const complexityScore =
    input.toolCalls +
    input.retries * config.retryWeight +
    input.reroutes * config.rerouteWeight +
    input.userCorrections * config.userCorrectionWeight;

  if (
    input.lastReviewTurnIndex !== undefined &&
    input.turnIndex - input.lastReviewTurnIndex <= config.cooldownTurns
  ) {
    return {
      shouldReview: false,
      reasonCodes: ["cooldown-blocked"],
      complexityScore,
    };
  }

  if (input.toolCalls >= config.toolCallForceThreshold) {
    reasonCodes.push("tool-call-force-threshold");
  } else if (input.toolCalls >= config.toolCallCandidateThreshold) {
    reasonCodes.push("tool-call-candidate-threshold");
  }

  if (input.retries > 0) reasonCodes.push("retry-amplifier");
  if (input.reroutes > 0) reasonCodes.push("reroute-amplifier");
  if (input.userCorrections > 0) reasonCodes.push("user-correction-amplifier");

  return {
    shouldReview: reasonCodes.length > 0,
    reasonCodes,
    complexityScore,
  };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- test/trigger/review-trigger.test.ts`
Expected: PASS，2 个测试通过

- [ ] **Step 5: Commit**

```bash
git add src/trigger/review-trigger.ts test/trigger/review-trigger.test.ts
git commit -m "实现复盘触发阈值与冷却逻辑"
```

## Task 6: Implement Review Prompt Builder and Worker

**Files:**
- Create: `src/review/review-prompt.ts`
- Create: `src/review/review-worker.ts`
- Create: `test/review/review-worker.test.ts`

- [ ] **Step 1: 写 review worker 测试**

```ts
import { describe, expect, it, vi } from "vitest";
import { runReviewWorker } from "../../src/review/review-worker.js";

describe("runReviewWorker", () => {
  it("parses structured JSON review output", async () => {
    const run = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: "learned a retry-first shell workflow",
        memoryCandidates: [],
        skillCandidates: [
          {
            slug: "retry-first-shell-workflow",
            title: "Retry-first shell workflow",
            summary: "Prefer quick verification before destructive retries",
            content: "# Retry-first shell workflow\n",
            confidence: 0.92
          }
        ],
        dedupeHints: [],
        reuseConfidence: 0.92
      }),
    });

    const result = await runReviewWorker({
      runSilentSubagent: run,
      prompt: "review now",
    });

    expect(run).toHaveBeenCalledWith({ prompt: "review now" });
    expect(result.skillCandidates[0]?.slug).toBe("retry-first-shell-workflow");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/review/review-worker.test.ts`
Expected: FAIL，报错缺少 `runReviewWorker`

- [ ] **Step 3: 写 review prompt 构造器**

```ts
export function buildReviewPrompt(params: {
  conversationSummary: string;
  reasonCodes: string[];
}) {
  return [
    "Review the completed OpenClaw turn and decide what is worth learning.",
    "Output strict JSON with keys: summary, memoryCandidates, skillCandidates, dedupeHints, reuseConfidence.",
    "Only write reusable skills for non-trivial workflows.",
    `Trigger reasons: ${params.reasonCodes.join(", ")}`,
    `Conversation summary:\n${params.conversationSummary}`,
  ].join("\n\n");
}
```

- [ ] **Step 4: 写 review worker 最小实现**

```ts
import type { ReviewResult } from "../types.js";

export async function runReviewWorker(params: {
  prompt: string;
  runSilentSubagent: (params: { prompt: string }) => Promise<{ text: string }>;
}): Promise<ReviewResult> {
  const response = await params.runSilentSubagent({ prompt: params.prompt });
  return JSON.parse(response.text) as ReviewResult;
}
```

- [ ] **Step 5: 运行测试并确认通过**

Run: `npm test -- test/review/review-worker.test.ts`
Expected: PASS，1 个测试通过

- [ ] **Step 6: Commit**

```bash
git add src/review/review-prompt.ts src/review/review-worker.ts test/review/review-worker.test.ts
git commit -m "实现后台复盘提示词与执行器"
```

## Task 7: Implement GrowthWriter for Memory and Candidate Skills

**Files:**
- Create: `src/growth/growth-writer.ts`
- Create: `test/growth/growth-writer.test.ts`
- Modify: `src/store/learning-store.ts`

- [ ] **Step 1: 写 GrowthWriter 测试**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LearningStore } from "../../src/store/learning-store.js";
import { applyGrowthResult } from "../../src/growth/growth-writer.js";

describe("applyGrowthResult", () => {
  it("writes memory and candidate skill into agent-scoped store", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "growth-writer-"));
    const store = new LearningStore({
      rootDir: root,
      sqliteFile: path.join(root, "index.sqlite"),
      auditLogFile: path.join(root, "learning-log.jsonl"),
      reviewsDir: path.join(root, "reviews"),
      skillsDir: path.join(root, "skills"),
      memoryDir: path.join(root, "memory"),
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
          { kind: "durable-memory", title: "Follow-up preference", content: "User prefers terse follow-up summaries.", confidence: 0.85 }
        ],
        skillCandidates: [
          { slug: "follow-up-protocol", title: "Follow-up protocol", summary: "Close tasks with terse summaries", content: "# Follow-up protocol\n", confidence: 0.91 }
        ],
        dedupeHints: [],
        reuseConfidence: 0.9
      }
    });

    expect(fs.readFileSync(path.join(root, "memory", "durable.md"), "utf8")).toContain("Follow-up preference");
    expect(fs.readFileSync(path.join(root, "skills", "follow-up-protocol", "SKILL.md"), "utf8")).toContain("# Follow-up protocol");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/growth/growth-writer.test.ts`
Expected: FAIL，报错缺少 `applyGrowthResult`

- [ ] **Step 3: 扩展 `LearningStore` 写入能力**

```ts
saveSkillRecord(params: {
  slug: string;
  title: string;
  summary: string;
  state: "candidate" | "promoted" | "stale" | "deprecated";
  confidence: number;
  reviewId: string;
}) {
  const db = this.requireDb();
  db.prepare(
    `INSERT OR REPLACE INTO skills (slug, title, summary, state, confidence, review_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.slug,
    params.title,
    params.summary,
    params.state,
    params.confidence,
    params.reviewId,
    new Date().toISOString(),
  );
}

saveMemoryRecord(params: {
  id: string;
  kind: string;
  title: string;
  content: string;
  confidence: number;
  reviewId: string;
}) {
  const db = this.requireDb();
  db.prepare(
    `INSERT OR REPLACE INTO memories (id, kind, title, content, confidence, review_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.kind,
    params.title,
    params.content,
    params.confidence,
    params.reviewId,
    new Date().toISOString(),
  );
}
```

- [ ] **Step 4: 写 `GrowthWriter` 实现**

```ts
import fs from "node:fs";
import path from "node:path";
import type { ReviewResult } from "../types.js";
import { LearningStore } from "../store/learning-store.js";

export function applyGrowthResult(params: {
  store: LearningStore;
  reviewId: string;
  result: ReviewResult;
}) {
  for (const memory of params.result.memoryCandidates) {
    params.store.saveMemoryRecord({
      id: `${params.reviewId}:${memory.title}`,
      kind: memory.kind,
      title: memory.title,
      content: memory.content,
      confidence: memory.confidence,
      reviewId: params.reviewId,
    });
    const memoryFile =
      memory.kind === "user-model" ? "user-model.md" : "durable.md";
    fs.appendFileSync(
      path.join(params.store.getPaths().memoryDir, memoryFile),
      `\n## ${memory.title}\n${memory.content}\n`,
      "utf8",
    );
  }

  for (const skill of params.result.skillCandidates) {
    params.store.saveSkillRecord({
      slug: skill.slug,
      title: skill.title,
      summary: skill.summary,
      state: "candidate",
      confidence: skill.confidence,
      reviewId: params.reviewId,
    });
    const skillDir = path.join(params.store.getPaths().skillsDir, skill.slug);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf8");
  }
}
```

- [ ] **Step 5: 运行测试并确认通过**

Run: `npm test -- test/growth/growth-writer.test.ts`
Expected: PASS，1 个测试通过

- [ ] **Step 6: Commit**

```bash
git add src/growth/growth-writer.ts src/store/learning-store.ts test/growth/growth-writer.test.ts
git commit -m "实现成长结果写入与候选技能落盘"
```

## Task 8: Implement GrowthRecall Prompt Assembly

**Files:**
- Create: `src/growth/growth-recall.ts`
- Create: `test/growth/growth-recall.test.ts`
- Modify: `src/store/learning-store.ts`

- [ ] **Step 1: 写召回测试**

```ts
import { describe, expect, it } from "vitest";
import { buildGrowthPromptAddition } from "../../src/growth/growth-recall.js";

describe("buildGrowthPromptAddition", () => {
  it("builds a compact system prompt addition from recent growth items", () => {
    const prompt = buildGrowthPromptAddition({
      memories: [
        { title: "Follow-up preference", content: "User prefers terse follow-up summaries." }
      ],
      skills: [
        { slug: "follow-up-protocol", summary: "Close tasks with terse summaries", state: "candidate" }
      ]
    });

    expect(prompt).toContain("Learned Memory");
    expect(prompt).toContain("follow-up-protocol");
    expect(prompt).toContain("User prefers terse follow-up summaries.");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/growth/growth-recall.test.ts`
Expected: FAIL，报错缺少 `buildGrowthPromptAddition`

- [ ] **Step 3: 增加读取接口**

```ts
listRecentMemories() {
  const db = this.requireDb();
  return db.prepare(
    `SELECT title, content, confidence FROM memories ORDER BY updated_at DESC LIMIT 5`,
  ).all() as Array<{ title: string; content: string; confidence: number }>;
}

listActiveSkills() {
  const db = this.requireDb();
  return db.prepare(
    `SELECT slug, summary, state, confidence FROM skills WHERE state IN ('candidate', 'promoted') ORDER BY updated_at DESC LIMIT 5`,
  ).all() as Array<{ slug: string; summary: string; state: string; confidence: number }>;
}
```

- [ ] **Step 4: 写召回 prompt 组装代码**

```ts
export function buildGrowthPromptAddition(params: {
  memories: Array<{ title: string; content: string }>;
  skills: Array<{ slug: string; summary: string; state: string }>;
}) {
  const memoryBlock = params.memories
    .map((item) => `- ${item.title}: ${item.content}`)
    .join("\n");
  const skillBlock = params.skills
    .map((item) => `- ${item.slug} [${item.state}]: ${item.summary}`)
    .join("\n");

  return [
    "Learned Memory:",
    memoryBlock || "- none",
    "",
    "Learned Skills:",
    skillBlock || "- none",
  ].join("\n");
}
```

- [ ] **Step 5: 运行测试并确认通过**

Run: `npm test -- test/growth/growth-recall.test.ts`
Expected: PASS，1 个测试通过

- [ ] **Step 6: Commit**

```bash
git add src/growth/growth-recall.ts src/store/learning-store.ts test/growth/growth-recall.test.ts
git commit -m "实现成长结果召回与系统提示补充"
```

## Task 9: Implement HermesLearningContextEngine

**Files:**
- Create: `src/context/hermes-learning-engine.ts`
- Create: `test/context/hermes-learning-engine.test.ts`

- [ ] **Step 1: 写 `context-engine` 集成测试**

```ts
import { describe, expect, it, vi } from "vitest";
import { createHermesLearningEngine } from "../../src/context/hermes-learning-engine.js";

describe("createHermesLearningEngine", () => {
  it("runs review on afterTurn and injects growth on assemble", async () => {
    const store = {
      listRecentMemories: vi.fn().mockReturnValue([{ title: "Preference", content: "Keep replies terse." }]),
      listActiveSkills: vi.fn().mockReturnValue([{ slug: "terse-close", summary: "Close tasks tersely", state: "candidate" }]),
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
          reuseConfidence: 0.9
        }),
      }),
      applyGrowthResult: vi.fn(),
      buildReviewPrompt: vi.fn().mockReturnValue("review prompt"),
      buildGrowthPromptAddition: vi.fn().mockReturnValue("Learned Memory:\n- Preference: Keep replies terse."),
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
        { role: "tool", name: "message", content: "ok" }
      ] as never[],
      prePromptMessageCount: 0,
    });

    expect(store.saveReview).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/context/hermes-learning-engine.test.ts`
Expected: FAIL，报错缺少 `createHermesLearningEngine`

- [ ] **Step 3: 写 `context-engine` 实现**

```ts
import { buildGrowthPromptAddition } from "../growth/growth-recall.js";
import { applyGrowthResult } from "../growth/growth-writer.js";
import { buildReviewPrompt } from "../review/review-prompt.js";
import { runReviewWorker } from "../review/review-worker.js";
import { decideReview } from "../trigger/review-trigger.js";
import type { ReviewComplexityInput } from "../types.js";

function summarizeTurnSignals(
  messages: Array<{ role?: string; name?: string; content?: string }>,
): ReviewComplexityInput {
  const toolMessages = messages.filter((message) => message.role === "tool");
  const uniqueTools = new Set(toolMessages.map((message) => message.name ?? "unknown"));
  return {
    toolCalls: toolMessages.length,
    uniqueTools: uniqueTools.size,
    retries: 0,
    reroutes: 0,
    userCorrections: 0,
    turnIndex: 1,
  };
}

export function createHermesLearningEngine(deps: {
  store: {
    listRecentMemories: () => Array<{ title: string; content: string }>;
    listActiveSkills: () => Array<{ slug: string; summary: string; state: string }>;
    saveReview: (params: {
      summary: string;
      complexityScore: number;
      reasonCodes: string[];
      rawResult: unknown;
    }) => string;
  };
  decideReview?: typeof decideReview;
  runReviewWorker?: typeof runReviewWorker;
  applyGrowthResult?: typeof applyGrowthResult;
  buildReviewPrompt?: typeof buildReviewPrompt;
  buildGrowthPromptAddition?: typeof buildGrowthPromptAddition;
  runSilentReview: (params: { prompt: string }) => Promise<{ text: string }>;
  reviewThresholds: {
    toolCallCandidateThreshold: number;
    toolCallForceThreshold: number;
    cooldownTurns: number;
    retryWeight: number;
    rerouteWeight: number;
    userCorrectionWeight: number;
  };
}) {
  const decide = deps.decideReview ?? decideReview;
  const review = deps.runReviewWorker ?? runReviewWorker;
  const writeGrowth = deps.applyGrowthResult ?? applyGrowthResult;
  const reviewPrompt = deps.buildReviewPrompt ?? buildReviewPrompt;
  const recallPrompt = deps.buildGrowthPromptAddition ?? buildGrowthPromptAddition;

  return {
    info: {
      id: "hermes-learning",
      name: "Hermes Learning",
      ownsCompaction: false,
    },
    async ingest() {
      return { ingested: true };
    },
    async assemble(params: { sessionId: string; messages: unknown[]; tokenBudget?: number }) {
      return {
        messages: params.messages as never[],
        estimatedTokens: 0,
        systemPromptAddition: recallPrompt({
          memories: deps.store.listRecentMemories(),
          skills: deps.store.listActiveSkills(),
        }),
      };
    },
    async compact() {
      return { ok: true, compacted: false, reason: "delegated-to-runtime" };
    },
    async afterTurn(params: { messages: Array<{ role?: string; name?: string; content?: string }>; prePromptMessageCount: number }) {
      const turnMessages = params.messages.slice(params.prePromptMessageCount);
      const decision = decide(summarizeTurnSignals(turnMessages), deps.reviewThresholds);
      if (!decision.shouldReview) return;

      const result = await review({
        prompt: reviewPrompt({
          conversationSummary: JSON.stringify(turnMessages),
          reasonCodes: decision.reasonCodes,
        }),
        runSilentSubagent: deps.runSilentReview,
      });

      const reviewId = deps.store.saveReview({
        summary: result.summary,
        complexityScore: decision.complexityScore,
        reasonCodes: decision.reasonCodes,
        rawResult: result,
      });
      writeGrowth({
        store: deps.store as never,
        reviewId,
        result,
      });
    },
  };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- test/context/hermes-learning-engine.test.ts`
Expected: PASS，1 个测试通过

- [ ] **Step 5: Commit**

```bash
git add src/context/hermes-learning-engine.ts test/context/hermes-learning-engine.test.ts
git commit -m "实现 Hermes 学习上下文引擎主闭环"
```

## Task 10: Wire Plugin Entry and Context Engine Registration

**Files:**
- Create: `src/index.ts`
- Create: `test/context/plugin-entry.test.ts`

- [ ] **Step 1: 写插件入口测试**

```ts
import { describe, expect, it, vi } from "vitest";
import plugin from "../../src/index.js";

describe("plugin entry", () => {
  it("registers the hermes-learning context engine", () => {
    const registerContextEngine = vi.fn();

    plugin.register({
      registerContextEngine,
      pluginConfig: {},
      config: {},
      runtime: {
        agent: {
          resolveAgentWorkspaceDir: vi.fn().mockReturnValue("/tmp/agent-main"),
          resolveAgentTimeoutMs: vi.fn().mockReturnValue(30000),
          runEmbeddedPiAgent: vi.fn().mockResolvedValue({
            finalText: JSON.stringify({
              summary: "reviewed",
              memoryCandidates: [],
              skillCandidates: [],
              dedupeHints: [],
              reuseConfidence: 0.9
            }),
          }),
        },
      },
    } as never);

    expect(registerContextEngine).toHaveBeenCalledWith(
      "hermes-learning",
      expect.any(Function),
    );
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- test/context/plugin-entry.test.ts`
Expected: FAIL，报错缺少 `src/index.ts`

- [ ] **Step 3: 写插件入口**

```ts
import crypto from "node:crypto";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { pluginConfigSchema } from "./config.js";
import { createHermesLearningEngine } from "./context/hermes-learning-engine.js";
import { resolveLearningPaths } from "./runtime/paths.js";
import { LearningStore } from "./store/learning-store.js";

export default definePluginEntry({
  id: "hermes-learning",
  name: "Hermes Learning",
  description: "Hermes-style learning loop plugin for OpenClaw",
  kind: "context-engine",
  configSchema: pluginConfigSchema,
  register(api) {
    const config = pluginConfigSchema.parse(api.pluginConfig ?? {});

    api.registerContextEngine("hermes-learning", () => {
      const workspaceDir = api.runtime.agent.resolveAgentWorkspaceDir(api.config);
      const paths = resolveLearningPaths({
        agentWorkspaceDir: workspaceDir,
        rootDirName: config.store.rootDirName,
      });
      const store = new LearningStore(paths);
      store.initialize();

      return createHermesLearningEngine({
        store,
        reviewThresholds: config.review,
        runSilentReview: async ({ prompt }) => {
          const result = await api.runtime.agent.runEmbeddedPiAgent({
            sessionId: "hermes-learning-review",
            runId: crypto.randomUUID(),
            sessionFile: `${workspaceDir}/sessions/hermes-learning-review.jsonl`,
            workspaceDir,
            prompt,
            timeoutMs: api.runtime.agent.resolveAgentTimeoutMs(api.config),
          });
          return {
            text: String(result.finalText ?? "{}"),
          };
        },
      });
    });
  },
});
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- test/context/plugin-entry.test.ts`
Expected: PASS，1 个测试通过

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/context/plugin-entry.test.ts
git commit -m "接入 OpenClaw 插件入口与生命周期注册"
```

## Task 11: Add Readme and Example Configuration

**Files:**
- Create: `README.md`
- Test: `README.md`

- [ ] **Step 1: 写 README 核心内容**

```md
# OpenClaw Hermes Learning

一个纯 OpenClaw 插件，在 `context-engine` 生命周期内实现 Hermes 风格 learning loop：

- `afterTurn` 阈值触发后台复盘
- 自动写入 agent 私有 `.openclaw-hermes/` 学习目录
- 生成 candidate skill 与 durable memory
- 下轮通过 `systemPromptAddition` 按需召回

## 开发

~~~bash
npm install
npm test
~~~

## 配置示例

~~~json5
{
  plugins: {
    slots: {
      contextEngine: "hermes-learning"
    },
    entries: {
      "hermes-learning": {
        enabled: true,
        config: {
          review: {
            toolCallCandidateThreshold: 6,
            toolCallForceThreshold: 10,
            cooldownTurns: 2
          }
        }
      }
    }
  }
}
~~~
```

- [ ] **Step 2: 检查 README 中的命令与文件名**

Run: `rg -n "hermes-learning|toolCallForceThreshold|contextEngine" README.md`
Expected: 输出包含插件 id、阈值配置和 `contextEngine` 示例

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "补充学习插件使用说明与配置示例"
```

## Task 12: Run Full Verification

**Files:**
- Modify: `package.json`
- Test: `test/**/*.test.ts`
- Test: `README.md`

- [ ] **Step 1: 运行全部测试**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 2: 运行类型检查**

Run: `npm run build`
Expected: TypeScript 编译成功，无类型错误

- [ ] **Step 3: 人工检查生成目录边界**

Run: `rg -n "\.openclaw-hermes|candidate|promoted|stale|deprecated" src test README.md`
Expected: 输出覆盖路径隔离与 Skill 生命周期关键字，确认实现与 spec 一致

- [ ] **Step 4: 最终提交**

```bash
git add README.md package.json src test
git commit -m "完成 OpenClaw Hermes 学习插件最小闭环"
```
