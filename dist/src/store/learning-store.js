import fs from "node:fs";
import path from "node:path";
export class LearningStore {
    paths;
    constructor(paths) {
        this.paths = paths;
    }
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
    saveReview(params) {
        const reviewId = `review_${Date.now()}`;
        const reviewRecord = {
            reviewId,
            summary: params.summary,
            complexityScore: params.complexityScore,
            reasonCodes: params.reasonCodes,
            rawResult: params.rawResult,
            createdAt: new Date().toISOString(),
        };
        fs.appendFileSync(this.paths.auditLogFile, `${JSON.stringify(reviewRecord)}\n`, "utf8");
        fs.writeFileSync(path.join(this.paths.reviewsDir, `${reviewId}.json`), JSON.stringify(reviewRecord, null, 2), "utf8");
        return reviewId;
    }
    saveSkillRecord(params) {
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
    saveMemoryRecord(params) {
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
        }));
    }
    listActiveSkills() {
        const skills = Object.values(this.readState().skills).filter((skill) => skill.state === "candidate" || skill.state === "promoted");
        // 排序: promoted 优先，然后按 hitCount 降序，最后按 updatedAt 降序
        return skills
            .sort((a, b) => {
            const stateOrder = { promoted: 0, candidate: 1 };
            const stateDiff = (stateOrder[a.state] ?? 2) - (stateOrder[b.state] ?? 2);
            if (stateDiff !== 0)
                return stateDiff;
            if (b.hitCount !== a.hitCount)
                return b.hitCount - a.hitCount;
            return b.updatedAt.localeCompare(a.updatedAt);
        })
            .slice(0, 5)
            .map((skill) => ({
            slug: skill.slug,
            summary: skill.summary,
            state: skill.state,
            confidence: skill.confidence,
        }));
    }
    listAllSkills() {
        return Object.values(this.readState().skills);
    }
    incrementHitCount(slug) {
        const state = this.readState();
        const skill = state.skills[slug];
        if (!skill)
            return;
        skill.hitCount += 1;
        skill.updatedAt = new Date().toISOString();
        this.writeState(state);
    }
    updateSkillState(slug, newState) {
        const state = this.readState();
        const skill = state.skills[slug];
        if (!skill)
            return;
        skill.state = newState;
        skill.updatedAt = new Date().toISOString();
        this.writeState(state);
    }
    readSkillContent(slug) {
        const skillFile = path.join(this.paths.skillsDir, slug, "SKILL.md");
        if (!fs.existsSync(skillFile)) {
            return undefined;
        }
        return fs.readFileSync(skillFile, "utf8");
    }
    findMemoryByTitle(title) {
        const state = this.readState();
        return Object.values(state.memories).find((memory) => memory.title === title);
    }
    findSkillBySlug(slug) {
        const state = this.readState();
        return state.skills[slug] ?? undefined;
    }
    updateSkillRecord(params) {
        const state = this.readState();
        const existing = state.skills[params.slug];
        if (!existing)
            return;
        existing.title = params.title;
        existing.summary = params.summary;
        existing.confidence = params.confidence;
        existing.reviewId = params.reviewId;
        existing.updatedAt = new Date().toISOString();
        this.writeState(state);
    }
    updateMemoryRecord(params) {
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
        const durableMemories = [];
        const userModelMemories = [];
        for (const memory of Object.values(state.memories)) {
            const block = `\n## ${memory.title}\n${memory.content}\n`;
            if (memory.kind === "user-model") {
                userModelMemories.push(block);
            }
            else {
                durableMemories.push(block);
            }
        }
        fs.writeFileSync(path.join(this.paths.memoryDir, "durable.md"), durableMemories.join(""), "utf8");
        fs.writeFileSync(path.join(this.paths.memoryDir, "user-model.md"), userModelMemories.join(""), "utf8");
    }
    readState() {
        if (!fs.existsSync(this.paths.stateFile)) {
            throw new Error("LearningStore not initialized");
        }
        return JSON.parse(fs.readFileSync(this.paths.stateFile, "utf8"));
    }
    writeState(state) {
        fs.writeFileSync(this.paths.stateFile, JSON.stringify(state, null, 2), "utf8");
    }
}
