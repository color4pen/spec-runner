/**
 * Concrete implementation of the SessionClient port.
 * This is the ONLY file allowed to import from @anthropic-ai/sdk in the adapter.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SessionClient } from "../../core/port/session-client.js";
import type { CustomToolHandler } from "../../core/tools/types.js";
import { pollUntilComplete } from "./completion.js";
import { runSseStream } from "./sse-stream.js";
import { createSession, sendEvents } from "./sdk/sessions.js";

export class AnthropicSessionClient implements SessionClient {
  constructor(private readonly client: Anthropic) {}

  async createSession(params: {
    agentId: string;
    environmentId: string;
    repoUrl: string;
    githubToken: string;
    branch?: string;
  }): Promise<{ sessionId: string }> {
    const session = await createSession(this.client, {
      agent: { id: params.agentId, type: "agent" },
      environment_id: params.environmentId,
      resources: [
        {
          type: "github_repository",
          url: params.repoUrl,
          authorization_token: params.githubToken,
          ...(params.branch
            ? { checkout: { type: "branch" as const, name: params.branch } }
            : {}),
        },
      ],
    });
    return { sessionId: session.id };
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    await sendEvents(this.client, sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text }],
        },
      ],
    });
  }

  async pollUntilComplete(
    sessionId: string,
    opts?: {
      timeoutMs?: number;
      sleepFn?: (ms: number) => Promise<void>;
      abortSignal?: AbortSignal;
    },
  ): Promise<{
    status: "idle" | "terminated" | "timeout";
    error?: { code: string; message: string; hint: string };
  }> {
    try {
      await pollUntilComplete(this.client, sessionId, opts?.abortSignal, {
        timeoutMs: opts?.timeoutMs,
        sleepFn: opts?.sleepFn,
      });
      return { status: "idle" };
    } catch (err) {
      const code = (err as { code?: string }).code ?? "SESSION_TIMEOUT";
      const message = (err as Error).message;
      const hint = (err as { hint?: string }).hint ?? "";

      if (code === "SESSION_TERMINATED") {
        return { status: "terminated", error: { code, message, hint } };
      }
      return { status: "timeout", error: { code, message, hint } };
    }
  }

  async streamEvents(
    sessionId: string,
    opts: {
      requestContent: string;
      slug: string;
      branch?: string;
      toolHandlers?: Map<string, CustomToolHandler>;
      onBranchRegistered?: (branch: string) => void;
      onSseDisconnected?: () => void;
      abortController?: AbortController;
    },
  ): Promise<{
    sseDisconnected: boolean;
    idleEndTurnDetected: boolean;
    terminated: boolean;
    terminationReason: "end_turn" | "terminated" | "sse_error" | "aborted" | "unknown";
  }> {
    return runSseStream({
      client: this.client,
      sessionId,
      requestContent: opts.requestContent,
      slug: opts.slug,
      branch: opts.branch,
      toolHandlers: opts.toolHandlers,
      onBranchRegistered: opts.onBranchRegistered,
      onSseDisconnected: opts.onSseDisconnected,
      abortController: opts.abortController,
    });
  }
}

/**
 * Factory function to create an AnthropicSessionClient.
 */
export function createAnthropicSessionClient(client: Anthropic): SessionClient {
  return new AnthropicSessionClient(client);
}
