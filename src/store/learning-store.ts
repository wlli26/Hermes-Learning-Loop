import fs from "node:fs";
import path from "node:path";

export type LearningStorePaths = {
  rootDir: string;
  auditLogFile: string;
  reviewsDir: string;
  skillsDir: string;
  memoryDir: string;
  stateFile: string;
};

export class LearningStore {
  constructor(private readonly paths: LearningStorePaths) {}

  initialize() {
    fs.mkdirSync(this.paths.rootDir, { recursive: true });
    fs.mkdirSync(this.paths.reviewsDir, { recursive: true });
    fs.mkdirSync(this.paths.skillsDir, { recursive: true });
    fs.mkdirSync(this.paths.memoryDir, { recursive: true });
    if (!fs.existsSync(this.paths.stateFile)) {
      this.writeState({
        skills: {},
        memories: {},
      });
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

  saveSkillRecord(params: {
    slug: string;
    title: string;
    summary: string;
    state: "candidate" | "promoted" | "stale" | "deprecated";
    confidence: number;
    reviewId: string;
  }) {
    const state = this.readState();
    state.skills[params.slug] = {
      slug: params.slug,
      title: params.title,
      summary: params.summary,
      state: params.state,
      confidence: params.confidence,
      reviewId: params.reviewId,
      hitCount: state.skills[params.slug]?.hitCount ?? 0,
      updatedAt: new Date().toISOString(),
    };
    this.writeState(state);
  }

  saveMemoryRecord(params: {
    id: string;
    kind: string;
    title: string;
    content: string;
    confidence: number;
    reviewId: string;
  }) {
    const state = this.readState();
    state.memories[params.id] = {
      id: params.id,
      kind: params.kind,
      title: params.title,
      content: params.content,
      confidence: params.confidence,
      reviewId: params.reviewId,
      updatedAt: new Date().toISOString(),
    };
    this.writeState(state);
  }

  listRecentMemories() {
    return Object.values(this.readState().memories)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((memory) => ({
        title: memory.title,
        content: memory.content,
        confidence: memory.confidence,
      })) as Array<{
      title: string;
      content: string;
      confidence: number;
    }>;
  }

  listActiveSkills() {
    const skills = Object.values(this.readState().skills).filter(
      (skill) => skill.state === "candidate" || skill.state === "promoted",
    );

    // 排序: promoted 优先，然后按 hitCount 降序，最后按 updatedAt 降序
    return skills
      .sort((a, b) => {
        const stateOrder: Record<string, number> = { promoted: 0, candidate: 1 };
        const stateDiff = (stateOrder[a.state] ?? 2) - (stateOrder[b.state] ?? 2);
        if (stateDiff !== 0) return stateDiff;
        if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 5)
      .map((skill) => ({
        slug: skill.slug,
        summary: skill.summary,
        state: skill.state,
        confidence: skill.confidence,
      })) as Array<{
      slug: string;
      summary: string;
      state: string;
      confidence: number;
    }>;
  }

  listAllSkills() {
    return Object.values(this.readState().skills);
  }

  incrementHitCount(slug: string) {
    const state = this.readState();
    const skill = state.skills[slug];
    if (!skill) return;
    skill.hitCount += 1;
    skill.updatedAt = new Date().toISOString();
    this.writeState(state);
  }

  updateSkillState(
    slug: string,
    newState: "candidate" | "promoted" | "stale" | "deprecated",
  ) {
    const state = this.readState();
    const skill = state.skills[slug];
    if (!skill) return;
    skill.state = newState;
    skill.updatedAt = new Date().toISOString();
    this.writeState(state);
  }

  readSkillContent(slug: string): string | undefined {
    const skillFile = path.join(this.paths.skillsDir, slug, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      return undefined;
    }
    return fs.readFileSync(skillFile, "utf8");
  }

  findMemoryByTitle(title: string) {
    const state = this.readState();
    return Object.values(state.memories).find((memory) => memory.title === title);
  }

  findSkillBySlug(slug: string) {
    const state = this.readState();
    return state.skills[slug] ?? undefined;
  }

  updateSkillRecord(params: {
    slug: string;
    title: string;
    summary: string;
    confidence: number;
    reviewId: string;
  }) {
    const state = this.readState();
    const existing = state.skills[params.slug];
    if (!existing) return;
    existing.title = params.title;
    existing.summary = params.summary;
    existing.confidence = params.confidence;
    existing.reviewId = params.reviewId;
    existing.updatedAt = new Date().toISOString();
    this.writeState(state);
  }

  updateMemoryRecord(params: {
    id: string;
    kind: string;
    title: string;
    content: string;
    confidence: number;
    reviewId: string;
  }) {
    const state = this.readState();
    state.memories[params.id] = {
      id: params.id,
      kind: params.kind,
      title: params.title,
      content: params.content,
      confidence: params.confidence,
      reviewId: params.reviewId,
      updatedAt: new Date().toISOString(),
    };
    this.writeState(state);
  }

  rebuildMemoryFiles() {
    const state = this.readState();
    const durableMemories: string[] = [];
    const userModelMemories: string[] = [];

    for (const memory of Object.values(state.memories)) {
      const block = `\n## ${memory.title}\n${memory.content}\n`;
      if (memory.kind === "user-model") {
        userModelMemories.push(block);
      } else {
        durableMemories.push(block);
      }
    }

    fs.writeFileSync(
      path.join(this.paths.memoryDir, "durable.md"),
      durableMemories.join(""),
      "utf8",
    );
    fs.writeFileSync(
      path.join(this.paths.memoryDir, "user-model.md"),
      userModelMemories.join(""),
      "utf8",
    );
  }

  private readState(): LearningState {
    if (!fs.existsSync(this.paths.stateFile)) {
      throw new Error("LearningStore not initialized");
    }
    return JSON.parse(fs.readFileSync(this.paths.stateFile, "utf8")) as LearningState;
  }

  private writeState(state: LearningState) {
    fs.writeFileSync(this.paths.stateFile, JSON.stringify(state, null, 2), "utf8");
  }
}

type LearningState = {
  skills: Record<
    string,
    {
      slug: string;
      title: string;
      summary: string;
      state: "candidate" | "promoted" | "stale" | "deprecated";
      confidence: number;
      reviewId: string;
      hitCount: number;
      updatedAt: string;
    }
  >;
  memories: Record<
    string,
    {
      id: string;
      kind: string;
      title: string;
      content: string;
      confidence: number;
      reviewId: string;
      updatedAt: string;
    }
  >;
};
