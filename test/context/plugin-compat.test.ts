import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("plugin compatibility", () => {
  it("does not depend on newer plugin-sdk subpaths", () => {
    const entrySource = fs.readFileSync(
      path.resolve("src/index.ts"),
      "utf8",
    );

    expect(entrySource).not.toContain("openclaw/plugin-sdk/agent-runtime");
    expect(entrySource).not.toContain("openclaw/plugin-sdk/plugin-entry");
  });

  it("keeps package metadata aligned with the manifest id", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve("package.json"), "utf8"),
    ) as {
      name?: string;
      openclaw?: { extensions?: string[] };
    };

    expect(packageJson.name).toBe("hermes-learning");
    expect(packageJson.openclaw?.extensions).toEqual(["./dist/index.js"]);
  });
});
