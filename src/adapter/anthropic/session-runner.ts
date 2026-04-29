/**
 * Moved from src/core/session-runner.ts.
 * All @anthropic-ai/sdk imports are isolated in src/adapter/anthropic/.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { createSession, sendEvents } from "./sdk/sessions.js";
import { stderrWrite } from "../../logger/stdout.js";
import { pollUntilComplete } from "./completion.js";

export interface ManagedAgentSessionInput {
  agentId: string;
  environmentId: string;
  repo: { owner: string; name: string };
  githubToken: string;
  initialMessage: string;
  timeoutMs: number;
  stepName: string;
  sleepFn?: (ms: number) => Promise<void>;
}

export interface ManagedAgentSessionResult {
  sessionId: string;
  status: "idle" | "terminated" | "timeout";
  error?: { code: string; message: string; hint: string };
}

/**
 * Run a managed agent session lifecycle:
 * 1. Create session
 * 2. Send initial message
 * 3. Poll until complete
 * 4. Return result (idle / terminated / timeout)
 *
 * Note: Does NOT call pushStepResult or writeJobState — that is the caller's responsibility.
 */
export async function runManagedAgentSession(
  client: Anthropic,
  input: ManagedAgentSessionInput,
): Promise<ManagedAgentSessionResult> {
  const { agentId, environmentId, repo, githubToken, initialMessage, timeoutMs, stepName, sleepFn } = input;

  const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
  let sessionId: string;
  try {
    const session = await createSession(client, {
      agent: { id: agentId, type: "agent" },
      environment_id: environmentId,
      resources: [
        {
          type: "github_repository",
          url: repoUrl,
          authorization_token: githubToken,
        },
      ],
    });
    sessionId = session.id;
  } catch (err) {
    const message = (err as Error).message;
    return {
      sessionId: "",
      status: "terminated",
      error: {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to create ${stepName} session: ${message}`,
        hint: "Check your API key and try again.",
      },
    };
  }

  try {
    await sendEvents(client, sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: initialMessage }],
        },
      ],
    });
  } catch (err) {
    const message = (err as Error).message;
    return {
      sessionId,
      status: "terminated",
      error: {
        code: "SESSION_CREATE_FAILED",
        message: `Failed to send initial message to ${stepName} session: ${message}`,
        hint: "Check your network connection.",
      },
    };
  }

  try {
    await pollUntilComplete(client, sessionId, undefined, {
      timeoutMs,
      sleepFn,
    });
    return { sessionId, status: "idle" };
  } catch (err) {
    const code = (err as { code?: string }).code ?? "SESSION_TIMEOUT";
    const message = (err as Error).message;
    const hint = (err as { hint?: string }).hint ?? "";

    if (code === "SESSION_TERMINATED") {
      stderrWrite(`${stepName} session was terminated by Anthropic.`);
      return {
        sessionId,
        status: "terminated",
        error: { code: "SESSION_TERMINATED", message, hint },
      };
    } else {
      const minutes = Math.round(timeoutMs / 60000);
      stderrWrite(`${stepName} session timed out after ${minutes} minutes.`);
      return {
        sessionId,
        status: "timeout",
        error: { code: "SESSION_TIMEOUT", message, hint },
      };
    }
  }
}
