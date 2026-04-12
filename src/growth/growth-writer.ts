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
