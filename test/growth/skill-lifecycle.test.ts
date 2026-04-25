import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { advanceSkillLifecycle } from "../../src/growth/skill-lifecycle.js";
import { LearningStore } from "../../src/store/learning-store.js";

describe("advanceSkillLifecycle", () => {
  it("promotes candidate skill to promoted after 3 hits", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-lifecycle-"));
    const store = new LearningStore({
      rootDir: root,
      auditLogFile: path.join(root, "learning-log.jsonl"),
      reviewsDir: path.join(root, "reviews"),
      skillsDir: path.join(root, "skills"),
      memoryDir: path.join(root, "memory"),
      stateFile: path.join(root, "state.json"),
    });
    store.initialize();

    store.saveSkillRecord({
      slug: "test-skill",
      title: "Test Skill",
      summary: "A test skill",
      state: "candidate",
      confidence: 0.8,
      reviewId: "review_1",
    });

    // 模拟 3 次命中
    store.incrementHitCount("test-skill");
    store.incrementHitCount("test-skill");
    store.incrementHitCount("test-skill");

    advanceSkillLifecycle(store);

    const skills = store.listAllSkills();
    const testSkill = skills.find((s) => s.slug === "test-skill");
    expect(testSkill?.state).toBe("promoted");
  });

  it("marks promoted skill as stale after 30 days of inactivity", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-lifecycle-"));
    const store = new LearningStore({
      rootDir: root,
      auditLogFile: path.join(root, "learning-log.jsonl"),
      reviewsDir: path.join(root, "reviews"),
      skillsDir: path.join(root, "skills"),
      memoryDir: path.join(root, "memory"),
      stateFile: path.join(root, "state.json"),
    });
    store.initialize();

    // 创建一个 promoted skill，手动设置 updatedAt 为 31 天前
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    store.saveSkillRecord({
      slug: "old-skill",
      title: "Old Skill",
      summary: "An old skill",
      state: "promoted",
      confidence: 0.9,
      reviewId: "review_1",
    });

    // 手动修改 updatedAt
    const state = JSON.parse(
      fs.readFileSync(path.join(root, "state.json"), "utf8"),
    ) as {
      skills: Record<string, { updatedAt: string }>;
    };
    state.skills["old-skill"].updatedAt = thirtyOneDaysAgo.toISOString();
    fs.writeFileSync(
      path.join(root, "state.json"),
      JSON.stringify(state, null, 2),
      "utf8",
    );

    advanceSkillLifecycle(store);

    const skills = store.listAllSkills();
    const oldSkill = skills.find((s) => s.slug === "old-skill");
    expect(oldSkill?.state).toBe("stale");
  });
});
