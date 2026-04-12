import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import plugin from "../../src/index.js";

describe("plugin entry", () => {
  it("registers an agent-scoped context engine and triggers silent review", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-entry-"));
    const registerContextEngine = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runEmbeddedPiAgent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: "learned terse closeout",
        memoryCandidates: [],
        skillCandidates: [],
        dedupeHints: [],
        reuseConfidence: 0.9,
      }),
    });
    const resolveAgentWorkspaceDir = vi.fn(
      (_config: unknown, agentId: string) => path.join(root, agentId),
    );

    plugin.register({
      id: "hermes-learning",
      name: "Hermes Learning",
      source: "test",
      registrationMode: "full",
      config: {
        agents: {
          defaults: {
            model: {
              primary: "custom-test/gpt-4.1",
            },
          },
        },
      },
      pluginConfig: {
        review: {
          toolCallCandidateThreshold: 1,
          toolCallForceThreshold: 1,
          cooldownTurns: 0,
          retryWeight: 1,
          rerouteWeight: 1,
          userCorrectionWeight: 1,
        },
        store: {
          rootDirName: ".openclaw-hermes-test",
        },
      },
      runtime: {
        agent: {
          defaults: {
            provider: "openai",
            model: "gpt-4.1",
          },
          resolveAgentWorkspaceDir,
          resolveAgentTimeoutMs: vi.fn().mockReturnValue(30_000),
          runEmbeddedPiAgent,
        },
      },
      logger,
      registerTool() {},
      registerHook() {},
      registerHttpRoute() {},
      registerChannel() {},
      registerGatewayMethod() {},
      registerCli() {},
      registerCliBackend() {},
      registerService() {},
      registerReload() {},
      registerNodeHostCommand() {},
      registerSecurityAuditCollector() {},
      registerConfigMigration() {},
      registerAutoEnableProbe() {},
      registerProvider() {},
      registerSpeechProvider() {},
      registerRealtimeTranscriptionProvider() {},
      registerRealtimeVoiceProvider() {},
      registerMediaUnderstandingProvider() {},
      registerImageGenerationProvider() {},
      registerMusicGenerationProvider() {},
      registerVideoGenerationProvider() {},
      registerWebFetchProvider() {},
      registerWebSearchProvider() {},
      registerInteractiveHandler() {},
      onConversationBindingResolved() {},
      registerCommand() {},
      registerContextEngine,
      registerMemoryCapability() {},
      registerMemoryPromptSection() {},
      registerMemoryPromptSupplement() {},
      registerMemoryCorpusSupplement() {},
      registerMemoryFlushPlan() {},
      registerMemoryRuntime() {},
      registerMemoryEmbeddingProvider() {},
      resolvePath(input: string) {
        return input;
      },
      on() {},
    } as never);

    expect(registerContextEngine).toHaveBeenCalledWith(
      "hermes-learning",
      expect.any(Function),
    );

    const factory = registerContextEngine.mock.calls[0]?.[1] as (() => Promise<{
      assemble(params: {
        sessionId: string;
        sessionKey?: string;
        messages: never[];
        tokenBudget: number;
      }): Promise<{ systemPromptAddition?: string }>;
      afterTurn?(params: {
        sessionId: string;
        sessionKey?: string;
        sessionFile: string;
        messages: never[];
        prePromptMessageCount: number;
      }): Promise<void>;
    }>) | undefined;

    expect(factory).toBeTypeOf("function");

    const engine = await factory?.();
    const assembled = await engine?.assemble({
      sessionId: "session-1",
      sessionKey: "agent:alpha:main",
      messages: [],
      tokenBudget: 1000,
    });

    expect(assembled?.systemPromptAddition).toContain("Learned Memory");

    await engine?.afterTurn?.({
      sessionId: "session-1",
      sessionKey: "agent:alpha:main",
      sessionFile: path.join(root, "session.jsonl"),
      messages: [{ role: "tool", name: "memory_search", content: "ok" }] as never[],
      prePromptMessageCount: 0,
    });

    expect(resolveAgentWorkspaceDir).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: {
          defaults: {
            model: {
              primary: "custom-test/gpt-4.1",
            },
          },
        },
      }),
      "alpha",
    );
    expect(runEmbeddedPiAgent).toHaveBeenCalledTimes(1);
    expect(runEmbeddedPiAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1:review",
        sessionKey: "agent:alpha:main:hermes-review:session-1",
      }),
    );
    expect(runEmbeddedPiAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "custom-test",
        model: "gpt-4.1",
        sessionFile: path.join(
          root,
          "alpha",
          ".openclaw-hermes-test",
          "review-sessions",
          "session-1-review.jsonl",
        ),
      }),
    );
    expect(
      fs.existsSync(path.join(root, "alpha", ".openclaw-hermes-test", "state.json")),
    ).toBe(true);
    expect(
      fs.readdirSync(path.join(root, "alpha", ".openclaw-hermes-test", "reviews")).length,
    ).toBe(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Hermes learning initialized store"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Hermes learning review triggered"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Hermes learning review completed"),
    );
  });
});
