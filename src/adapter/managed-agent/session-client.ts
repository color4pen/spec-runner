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
import { normalizeSessionError } from "./session-error.js";

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
      sleepFn?: (ms: number) => Promise<void>;
      abortSignal?: AbortSignal;
    },
  ): Promise<{
    status: "idle" | "terminated";
    error?: { code: string; message: string; hint: string };
  }> {
    try {
      await pollUntilComplete(this.client, sessionId, opts?.abortSignal, {
        sleepFn: opts?.sleepFn,
      });
      return { status: "idle" };
    } catch (err) {
      return { status: "terminated", error: normalizeSessionError(err) };
    }
  }

  async streamEvents(
    sessionId: string,
    opts: {
      requestContent: string;
      slug: string;
      branch?: string;
      toolHandlers?: Map<string, CustomToolHandler>;
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
