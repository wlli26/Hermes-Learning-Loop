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
        expect(paths.stateFile).toBe(path.join(paths.rootDir, "state.json"));
    });
    it("uses separate skillsDir when skillsDirName is provided", () => {
        const paths = resolveLearningPaths({
            agentWorkspaceDir: "/tmp/workspaces/main",
            rootDirName: ".openclaw-hermes",
            skillsDirName: "../skills",
        });
        expect(paths.rootDir).toBe(path.join("/tmp/workspaces/main", ".openclaw-hermes"));
        expect(paths.skillsDir).toBe(path.join("/tmp/workspaces/main", "../skills"));
        expect(paths.memoryDir).toBe(path.join(paths.rootDir, "memory"));
    });
});
