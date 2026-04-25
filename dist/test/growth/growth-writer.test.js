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
            minMemoryConfidence: 0.5,
            minSkillConfidence: 0.6,
        });
        expect(fs.readFileSync(path.join(root, "memory", "durable.md"), "utf8")).toContain("Follow-up preference");
        expect(fs.readFileSync(path.join(root, "skills", "follow-up-protocol", "SKILL.md"), "utf8")).toContain("# Follow-up protocol");
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
                        scope: "Use when asked to validate a Hermes Learning/OpenClaw plugin repo.",
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
                ],
                dedupeHints: [],
                reuseConfidence: 0.88,
            },
            minMemoryConfidence: 0.5,
            minSkillConfidence: 0.6,
        });
        const skillDoc = fs.readFileSync(path.join(root, "skills", "hermes-learning", "SKILL.md"), "utf8");
        expect(skillDoc).toContain("---\nname: hermes-learning");
        expect(skillDoc).toContain('description: "This is a reusable workflow for validating the plugin."');
        expect(skillDoc).toContain("# Hermes Learning 插件验收技能");
        expect(skillDoc).toContain("## When to Use");
        expect(skillDoc).toContain("## Procedure");
        expect(skillDoc).toContain("Run the focused plugin-entry test.");
        expect(skillDoc).toContain("## Outputs");
        const state = JSON.parse(fs.readFileSync(path.join(root, "state.json"), "utf8"));
        expect(state.skills["hermes-learning"]?.summary).toContain("reusable workflow");
        expect(state.skills["hermes-learning"]?.confidence).toBe(0.88);
    });
    it("filters out low-confidence candidates below threshold", () => {
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
            summary: "test confidence filtering",
            complexityScore: 5,
            reasonCodes: ["tool-call-candidate-threshold"],
            rawResult: {},
        });
        applyGrowthResult({
            store,
            reviewId,
            result: {
                summary: "test confidence filtering",
                memoryCandidates: [
                    {
                        kind: "durable-memory",
                        title: "High confidence memory",
                        content: "This should be written",
                        confidence: 0.8,
                    },
                    {
                        kind: "durable-memory",
                        title: "Low confidence memory",
                        content: "This should be filtered",
                        confidence: 0.3,
                    },
                ],
                skillCandidates: [
                    {
                        slug: "high-confidence-skill",
                        title: "High confidence skill",
                        summary: "This should be written",
                        content: "# High confidence skill\n",
                        confidence: 0.7,
                    },
                    {
                        slug: "low-confidence-skill",
                        title: "Low confidence skill",
                        summary: "This should be filtered",
                        content: "# Low confidence skill\n",
                        confidence: 0.4,
                    },
                ],
                dedupeHints: [],
                reuseConfidence: 0.5,
            },
            minMemoryConfidence: 0.5,
            minSkillConfidence: 0.6,
        });
        const memoryContent = fs.readFileSync(path.join(root, "memory", "durable.md"), "utf8");
        expect(memoryContent).toContain("High confidence memory");
        expect(memoryContent).not.toContain("Low confidence memory");
        expect(fs.existsSync(path.join(root, "skills", "high-confidence-skill", "SKILL.md"))).toBe(true);
        expect(fs.existsSync(path.join(root, "skills", "low-confidence-skill", "SKILL.md"))).toBe(false);
    });
    it("respects dedupeHints to skip duplicate candidates", () => {
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
            summary: "test deduplication",
            complexityScore: 5,
            reasonCodes: ["tool-call-candidate-threshold"],
            rawResult: {},
        });
        applyGrowthResult({
            store,
            reviewId,
            result: {
                summary: "test deduplication",
                memoryCandidates: [
                    {
                        kind: "durable-memory",
                        title: "Unique memory",
                        content: "This should be written",
                        confidence: 0.8,
                    },
                    {
                        kind: "durable-memory",
                        title: "Duplicate memory",
                        content: "This should be skipped",
                        confidence: 0.8,
                    },
                ],
                skillCandidates: [
                    {
                        slug: "unique-skill",
                        title: "Unique skill",
                        summary: "This should be written",
                        content: "# Unique skill\n",
                        confidence: 0.7,
                    },
                    {
                        slug: "duplicate-skill",
                        title: "Duplicate skill",
                        summary: "This should be skipped",
                        content: "# Duplicate skill\n",
                        confidence: 0.7,
                    },
                ],
                dedupeHints: ["Duplicate memory", "duplicate-skill"],
                reuseConfidence: 0.5,
            },
            minMemoryConfidence: 0.5,
            minSkillConfidence: 0.6,
        });
        const memoryContent = fs.readFileSync(path.join(root, "memory", "durable.md"), "utf8");
        expect(memoryContent).toContain("Unique memory");
        expect(memoryContent).not.toContain("Duplicate memory");
        expect(fs.existsSync(path.join(root, "skills", "unique-skill", "SKILL.md"))).toBe(true);
        expect(fs.existsSync(path.join(root, "skills", "duplicate-skill", "SKILL.md"))).toBe(false);
    });
    it("updates existing skill when slug is in dedupeHints", () => {
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
        // 第一次创建 skill
        const reviewId1 = store.saveReview({
            summary: "initial skill creation",
            complexityScore: 5,
            reasonCodes: ["tool-call-candidate-threshold"],
            rawResult: {},
        });
        applyGrowthResult({
            store,
            reviewId: reviewId1,
            result: {
                summary: "initial skill creation",
                memoryCandidates: [],
                skillCandidates: [
                    {
                        slug: "test-skill",
                        title: "Test Skill",
                        summary: "Original summary",
                        content: "# Test Skill\n\nOriginal content",
                        confidence: 0.8,
                    },
                ],
                dedupeHints: [],
                reuseConfidence: 0.7,
            },
            minMemoryConfidence: 0.5,
            minSkillConfidence: 0.6,
        });
        // 验证初始创建
        const initialContent = fs.readFileSync(path.join(root, "skills", "test-skill", "SKILL.md"), "utf8");
        expect(initialContent).toContain("Original content");
        const initialState = JSON.parse(fs.readFileSync(path.join(root, "state.json"), "utf8"));
        expect(initialState.skills["test-skill"].summary).toBe("Original summary");
        expect(initialState.skills["test-skill"].reviewId).toBe(reviewId1);
        // 第二次更新 skill（slug 在 dedupeHints 中）
        const reviewId2 = store.saveReview({
            summary: "skill update",
            complexityScore: 5,
            reasonCodes: ["tool-call-candidate-threshold"],
            rawResult: {},
        });
        applyGrowthResult({
            store,
            reviewId: reviewId2,
            result: {
                summary: "skill update",
                memoryCandidates: [],
                skillCandidates: [
                    {
                        slug: "test-skill",
                        title: "Test Skill Updated",
                        summary: "Updated summary with new features",
                        content: "# Test Skill\n\nUpdated content with improvements",
                        confidence: 0.85,
                    },
                ],
                dedupeHints: ["test-skill"], // 标记为已存在
                reuseConfidence: 0.75,
            },
            minMemoryConfidence: 0.5,
            minSkillConfidence: 0.6,
        });
        // 验证内容已更新
        const updatedContent = fs.readFileSync(path.join(root, "skills", "test-skill", "SKILL.md"), "utf8");
        expect(updatedContent).toContain("Updated content with improvements");
        expect(updatedContent).not.toContain("Original content");
        // 验证 state.json 已更新
        const updatedState = JSON.parse(fs.readFileSync(path.join(root, "state.json"), "utf8"));
        expect(updatedState.skills["test-skill"].summary).toBe("Updated summary with new features");
        expect(updatedState.skills["test-skill"].reviewId).toBe(reviewId2);
        // state 应该保持不变（不会重置为 candidate）
        expect(updatedState.skills["test-skill"].state).toBe("candidate");
    });
});
