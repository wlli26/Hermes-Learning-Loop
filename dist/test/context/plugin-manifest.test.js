import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
describe("plugin manifest", () => {
    it("declares review and store config fields for installer-side validation", () => {
        const manifest = JSON.parse(fs.readFileSync(path.resolve("openclaw.plugin.json"), "utf8"));
        const properties = manifest.configSchema?.properties ?? {};
        expect(properties.review).toBeTruthy();
        expect(properties.store).toBeTruthy();
    });
});
