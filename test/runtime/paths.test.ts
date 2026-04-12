import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLearningPaths } from "../../src/runtime/paths.js";

describe("resolveLearningPaths", () => {
  it("builds agent-scoped plugin directories", () => {
    const paths = resolveLearningPaths({
      agentWorkspaceDir: "/tmp/workspaces/main",
      rootDirName: ".openclaw-hermes",
    });

    expect(paths.rootDir).toBe(
      path.join("/tmp/workspaces/main", ".openclaw-hermes"),
    );
    expect(paths.reviewsDir).toBe(path.join(paths.rootDir, "reviews"));
    expect(paths.skillsDir).toBe(path.join(paths.rootDir, "skills"));
    expect(paths.memoryDir).toBe(path.join(paths.rootDir, "memory"));
    expect(paths.sqliteFile).toBe(path.join(paths.rootDir, "index.sqlite"));
  });
});
