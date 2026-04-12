import { z } from "zod";

export const pluginConfigSchema = z.object({
  review: z
    .object({
      toolCallCandidateThreshold: z.number().int().min(1).default(6),
      toolCallForceThreshold: z.number().int().min(1).default(10),
      cooldownTurns: z.number().int().min(0).default(2),
      retryWeight: z.number().min(0).default(1),
      rerouteWeight: z.number().min(0).default(1),
      userCorrectionWeight: z.number().min(0).default(1),
    })
    .default({}),
  store: z
    .object({
      rootDirName: z.string().min(1).default(".openclaw-hermes"),
    })
    .default({}),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export const defaultPluginConfig: PluginConfig = pluginConfigSchema.parse({});
