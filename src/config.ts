import { z } from "zod";

export const pluginConfigSchema = z.object({
  review: z
    .object({
      toolCallCandidateThreshold: z.number().int().min(1).default(1),
      toolCallForceThreshold: z.number().int().min(1).default(2),
      cooldownTurns: z.number().int().min(0).default(2),
      retryWeight: z.number().min(0).default(1),
      rerouteWeight: z.number().min(0).default(1),
      userCorrectionWeight: z.number().min(0).default(1),
      minMemoryConfidence: z.number().min(0).max(1).default(0.5),
      minSkillConfidence: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
  store: z
    .object({
      rootDirName: z.string().min(1).default(".openclaw-hermes"),
      skillsDirName: z.string().min(1).default("../skills"),
      useGlobalState: z.boolean().default(true),
    })
    .default({}),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export const defaultPluginConfig: PluginConfig = pluginConfigSchema.parse({});
