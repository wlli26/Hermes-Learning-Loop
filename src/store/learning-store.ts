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
    return Object.values(this.readState().skills)
      .filter((skill) => skill.state === "candidate" || skill.state === "promoted")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
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
