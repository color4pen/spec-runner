/**
 * Unit tests for AnthropicSessionClient.createSession — branch checkout propagation.
 *
 * Regression for the dogfooding-001 second-pass bug where every post-propose
 * session mounted the workspace at main because the adapter ignored the
 * `checkout` option of the github_repository resource.
 */
import { describe, it, expect, vi } from "vitest";
import { AnthropicSessionClient } from "../../../../src/adapter/managed-agent/session-client.js";

function makeFakeAnthropic(createSpy: ReturnType<typeof vi.fn>): unknown {
  return {
    beta: {
      sessions: {
        create: createSpy,
      },
    },
  };
}

function makeFakeAnthropicWithRetrieve(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number };
}): ConstructorParameters<typeof AnthropicSessionClient>[0] {
  return {
    beta: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ id: "sess-abc", usage }),
      },
    },
  } as unknown as ConstructorParameters<typeof AnthropicSessionClient>[0];
}

function makeFakeAnthropicWithRetrieveError(
  error: Error,
): ConstructorParameters<typeof AnthropicSessionClient>[0] {
  return {
    beta: {
      sessions: {
        retrieve: vi.fn().mockRejectedValue(error),
      },
    },
  } as unknown as ConstructorParameters<typeof AnthropicSessionClient>[0];
}

describe("AnthropicSessionClient.createSession — branch propagation", () => {
  it("passes checkout: { type: 'branch', name } when branch is provided", async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: "sess_xyz" });
    const fake = makeFakeAnthropic(createSpy) as ConstructorParameters<typeof AnthropicSessionClient>[0];
    const client = new AnthropicSessionClient(fake);

    await client.createSession({
      agentId: "agent_1",
      environmentId: "env_1",
      repoUrl: "https://github.com/owner/repo",
      githubToken: "ghp_token",
      branch: "feat/my-slug",
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const params = createSpy.mock.calls[0]![0];
    expect(params.resources).toHaveLength(1);
    expect(params.resources[0]).toMatchObject({
      type: "github_repository",
      url: "https://github.com/owner/repo",
      authorization_token: "ghp_token",
      checkout: { type: "branch", name: "feat/my-slug" },
    });
  });

  it("omits checkout when branch is not provided (propose case)", async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: "sess_propose" });
    const fake = makeFakeAnthropic(createSpy) as ConstructorParameters<typeof AnthropicSessionClient>[0];
    const client = new AnthropicSessionClient(fake);

    await client.createSession({
      agentId: "agent_1",
      environmentId: "env_1",
      repoUrl: "https://github.com/owner/repo",
      githubToken: "ghp_token",
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const resource = createSpy.mock.calls[0]![0].resources[0];
    expect(resource).not.toHaveProperty("checkout");
  });

  it("returns the SDK-created session id", async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: "sess_returned" });
    const fake = makeFakeAnthropic(createSpy) as ConstructorParameters<typeof AnthropicSessionClient>[0];
    const client = new AnthropicSessionClient(fake);

    const result = await client.createSession({
      agentId: "agent_1",
      environmentId: "env_1",
      repoUrl: "https://github.com/owner/repo",
      githubToken: "ghp_token",
      branch: "feat/x",
    });

    expect(result).toEqual({ sessionId: "sess_returned" });
  });
});

// ---------------------------------------------------------------------------
// TC-09 / TC-10: getSessionUsage — adapter 実装の直接 unit test
// ---------------------------------------------------------------------------

describe("AnthropicSessionClient.getSessionUsage", () => {
  it("TC-09: retrieveSession が usage を返す → マップされた SessionUsage を返す", async () => {
    const fake = makeFakeAnthropicWithRetrieve({ input_tokens: 100, output_tokens: 200 });
    const client = new AnthropicSessionClient(fake);
    const result = await client.getSessionUsage("sess-abc");
    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 200,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });

  it("TC-10: retrieveSession が throw する → undefined を返す (best-effort)", async () => {
    const fake = makeFakeAnthropicWithRetrieveError(new Error("network error"));
    const client = new AnthropicSessionClient(fake);
    const result = await client.getSessionUsage("sess-abc");
    expect(result).toBeUndefined();
  });
});
