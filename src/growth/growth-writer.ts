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

  for (const [index, skill] of params.result.skillCandidates.entries()) {
    const normalizedSkill = normalizeSkillCandidate({
      candidate: skill as unknown,
      fallbackConfidence: params.result.reuseConfidence,
      fallbackSlug: `skill-${index + 1}`,
    });
    if (!normalizedSkill) {
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
    const skillDir = path.join(params.store.getPaths().skillsDir, normalizedSkill.slug);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), normalizedSkill.content, "utf8");
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
