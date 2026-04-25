import { describe, expect, it } from "vitest";
import { defaultPluginConfig, pluginConfigSchema } from "../../src/config.js";
describe("pluginConfigSchema", () => {
    it("provides stable defaults", () => {
        const parsed = pluginConfigSchema.parse({});
        expect(parsed.review.toolCallCandidateThreshold).toBe(1);
        expect(parsed.review.toolCallForceThreshold).toBe(2);
        expect(parsed.review.cooldownTurns).toBe(2);
        expect(parsed.store.rootDirName).toBe(".openclaw-hermes");
    });
    it("rejects invalid cooldown values", () => {
        expect(() => pluginConfigSchema.parse({
            review: { cooldownTurns: -1 },
        })).toThrow(/cooldown/i);
    });
    it("exports the same defaults object shape", () => {
        expect(defaultPluginConfig.review.toolCallForceThreshold).toBe(2);
    });
});
