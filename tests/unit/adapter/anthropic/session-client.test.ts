/**
 * Unit tests for AnthropicSessionClient.createSession — branch checkout propagation.
 *
 * Regression for the dogfooding-001 second-pass bug where every post-propose
 * session mounted the workspace at main because the adapter ignored the
 * `checkout` option of the github_repository resource.
 */
import { describe, it, expect, vi } from "vitest";
import { AnthropicSessionClient } from "../../../../src/adapter/anthropic/session-client.js";

function makeFakeAnthropic(createSpy: ReturnType<typeof vi.fn>): unknown {
  return {
    beta: {
      sessions: {
        create: createSpy,
      },
    },
  };
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
