import fs from "node:fs";
import path from "node:path";
import type { ReviewResult } from "../types.js";
import { LearningStore } from "../store/learning-store.js";

export function applyGrowthResult(params: {
  store: LearningStore;
  reviewId: string;
  result: ReviewResult;
  minMemoryConfidence: number;
  minSkillConfidence: number;
}) {
  const dedupeSet = new Set(params.result.dedupeHints ?? []);

  for (const memory of params.result.memoryCandidates) {
    const normalized = normalizeMemoryCandidate(memory);
    if (!normalized) {
      continue;
    }
    if (normalized.confidence < params.minMemoryConfidence) {
      continue;
    }
    if (dedupeSet.has(normalized.title)) {
      continue;
    }

    const memoryId = `${params.reviewId}:${normalized.title}`;

    // 检查是否已存在相同 title 的记忆，若存在则更新而非追加
    const existingMemory = params.store.findMemoryByTitle(normalized.title);
    if (existingMemory) {
      params.store.updateMemoryRecord({
        id: existingMemory.id,
        kind: normalized.kind,
        title: normalized.title,
        content: normalized.content,
        confidence: normalized.confidence,
        reviewId: params.reviewId,
      });
      // 重写 memory 文件
      params.store.rebuildMemoryFiles();
    } else {
      params.store.saveMemoryRecord({
        id: memoryId,
        kind: normalized.kind,
        title: normalized.title,
        content: normalized.content,
        confidence: normalized.confidence,
        reviewId: params.reviewId,
      });
      const memoryFile =
        normalized.kind === "user-model" ? "user-model.md" : "durable.md";
      fs.appendFileSync(
        path.join(params.store.getPaths().memoryDir, memoryFile),
        `\n## ${normalized.title}\n${normalized.content}\n`,
        "utf8",
      );
    }
  }

  for (const [index, skill] of params.result.skillCandidates.entries()) {
    const normalizedSkill = normalizeSkillCandidate({
      candidate: skill as unknown,
      fallbackConfidence: params.result.reuseConfidence,
      fallbackSlug: `skill-${index + 1}`,
    });
    if (!normalizedSkill) {
      continue;
    }
    if (normalizedSkill.confidence < params.minSkillConfidence) {
      continue;
    }

    const skillDir = path.join(params.store.getPaths().skillsDir, normalizedSkill.slug);

    try {
      fs.mkdirSync(skillDir, { recursive: true });

      if (dedupeSet.has(normalizedSkill.slug)) {
        // Skill 已存在：更新内容和 state.json，保留 state 和 hitCount
        const existing = params.store.findSkillBySlug(normalizedSkill.slug);
        if (existing) {
          params.store.updateSkillRecord({
            slug: normalizedSkill.slug,
            title: normalizedSkill.title,
            summary: normalizedSkill.summary,
            confidence: normalizedSkill.confidence,
            reviewId: params.reviewId,
          });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), normalizedSkill.content, "utf8");
          console.log(`[GrowthWriter] Skill updated: ${normalizedSkill.slug}`);
        } else {
          // dedupeHints 中有但 state.json 中没有 → 说明之前写入失败，重新创建
          console.warn(
            `[GrowthWriter] Skill ${normalizedSkill.slug} in dedupeHints but not in state, recreating`,
          );
          params.store.saveSkillRecord({
            slug: normalizedSkill.slug,
            title: normalizedSkill.title,
            summary: normalizedSkill.summary,
            state: "candidate",
            confidence: normalizedSkill.confidence,
            reviewId: params.reviewId,
          });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), normalizedSkill.content, "utf8");
          console.log(`[GrowthWriter] Skill recreated: ${normalizedSkill.slug}`);
        }
        continue;
      }

      params.store.saveSkillRecord({
        slug: normalizedSkill.slug,
        title: normalizedSkill.title,
        summary: normalizedSkill.summary,
        state: "candidate",
        confidence: normalizedSkill.confidence,
        reviewId: params.reviewId,
      });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), normalizedSkill.content, "utf8");
      console.log(`[GrowthWriter] Skill created: ${normalizedSkill.slug}`);

      // 验证写入成功
      const skillFile = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillFile)) {
        throw new Error(`SKILL.md file not found after write: ${skillFile}`);
      }
      const writtenContent = fs.readFileSync(skillFile, "utf8");
      if (writtenContent !== normalizedSkill.content) {
        throw new Error(`SKILL.md content verification failed for ${normalizedSkill.slug}`);
      }
    } catch (error) {
      console.error(
        `[GrowthWriter] Failed to save skill ${normalizedSkill.slug}:`,
        error instanceof Error ? error.message : String(error),
      );
      // 清理失败的目录
      try {
        if (fs.existsSync(skillDir)) {
          fs.rmSync(skillDir, { recursive: true, force: true });
          console.log(`[GrowthWriter] Cleaned up failed skill directory: ${skillDir}`);
        }
      } catch (cleanupError) {
        console.error(
          `[GrowthWriter] Failed to cleanup directory ${skillDir}:`,
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        );
      }
    }
  }
}

function normalizeSkillCandidate(params: {
  candidate: unknown;
  fallbackConfidence: number;
  fallbackSlug: string;
}) {
  if (!params.candidate || typeof params.candidate !== "object") {
    return null;
  }

  const candidate = params.candidate as Record<string, unknown>;
  const title = readString(candidate.title) ?? readString(candidate.slug);
  const slug = slugify(readString(candidate.slug) ?? title, params.fallbackSlug);
  const confidence = readConfidence(candidate.confidence, params.fallbackConfidence);
  const summary =
    readString(candidate.summary) ??
    readString(candidate.why) ??
    readString(candidate.scope) ??
    title;

  if (!title || !summary) {
    return null;
  }

  const content =
    readString(candidate.content) ??
    buildSkillMarkdown({
      slug,
      title,
      description: summary,
      scope: readString(candidate.scope),
      inputs: readStringList(candidate.inputs),
      coreSteps: readStringList(candidate.coreSteps),
      outputs: readStringList(candidate.outputs),
      caveats: readStringList(candidate.caveats),
    });

  return {
    slug,
    title,
    summary,
    content,
    confidence,
  };
}

function buildSkillMarkdown(params: {
  slug: string;
  title: string;
  description: string;
  scope?: string;
  inputs: string[];
  coreSteps: string[];
  outputs: string[];
  caveats: string[];
}) {
  const sections = [
    "---",
    `name: ${params.slug}`,
    `description: ${quoteYamlString(params.description)}`,
    "---",
    "",
    `# ${params.title}`,
    "",
    params.description,
    "",
    "## When to Use",
    "",
    params.scope
      ? ensureUseWhenSentence(params.scope)
      : `Use when the user needs help with ${params.title}.`,
  ];
  if (params.inputs.length > 0) {
    sections.push("", "## Inputs", "", ...params.inputs.map((item) => `- ${item}`));
  }
  if (params.coreSteps.length > 0) {
    sections.push("", "## Procedure", "", ...params.coreSteps.map((item) => `1. ${item}`));
  }
  if (params.outputs.length > 0) {
    sections.push("", "## Outputs", "", ...params.outputs.map((item) => `- ${item}`));
  }
  if (params.caveats.length > 0) {
    sections.push("", "## Caveats", "", ...params.caveats.map((item) => `- ${item}`));
  }

  return `${sections.join("\n")}\n`;
}

function ensureUseWhenSentence(value: string) {
  const trimmed = value.trim();
  if (/^use when\b/iu.test(trimmed)) {
    return trimmed;
  }
  return `Use when ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

function quoteYamlString(value: string) {
  return JSON.stringify(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

function readConfidence(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampConfidence(value);
  }
  return clampConfidence(fallback);
}

function clampConfidence(value: number) {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function slugify(value: string | undefined, fallback: string) {
  const normalized = value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "");

  return normalized || fallback;
}

function normalizeMemoryCandidate(raw: unknown): {
  kind: string;
  title: string;
  content: string;
  confidence: number;
} | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;

  // Standard format: { kind, title, content, confidence }
  const title = readString(candidate.title);
  const content = readString(candidate.content);
  if (title && content) {
    const kind = readString(candidate.kind) ?? "durable";
    const confidence = readConfidence(candidate.confidence, 0.7);
    return { kind, title, content, confidence };
  }

  // Alternate format 1: { category, key, value, context }
  const key = readString(candidate.key);
  const value = readString(candidate.value);
  if (key && value) {
    const category = readString(candidate.category) ?? "";
    const context = readString(candidate.context) ?? "";
    const kind = category === "user-preference" ? "user-model" : "durable";
    const normalizedTitle = key
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const normalizedContent = context ? `${value}. ${context}` : value;
    return {
      kind,
      title: normalizedTitle,
      content: normalizedContent,
      confidence: 0.7,
    };
  }

  // Alternate format 2: { category, content, importance } (legacy)
  if (content) {
    const category = readString(candidate.category) ?? "";
    const importance = readString(candidate.importance);
    const kind = category === "user-preference" || category === "output-convention"
      ? "user-model"
      : "durable";

    // Extract title from content (first sentence or first 50 chars)
    const firstSentence = content.split(/[.!?。！？]/)[0]?.trim();
    const extractedTitle = firstSentence && firstSentence.length <= 80
      ? firstSentence
      : content.slice(0, 50).trim() + "...";

    const confidence = importance === "high" ? 0.9 : importance === "medium" ? 0.7 : 0.5;

    return {
      kind,
      title: extractedTitle,
      content,
      confidence,
    };
  }

  return null;
}
