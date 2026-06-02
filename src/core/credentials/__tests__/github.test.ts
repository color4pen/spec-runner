import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveGitHubToken } from "../github.js";
import type { SpawnFn } from "../../../util/spawn.js";

vi.mock("../credentials-io.js", () => ({
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn(),
}));

import { loadCredentials } from "../credentials-io.js";

const mockLoadCredentials = vi.mocked(loadCredentials);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no stored credentials
  mockLoadCredentials.mockResolvedValue({});
});

describe("resolveGitHubToken", () => {
  it("resolves GH_TOKEN with source: env", async () => {
    const result = await resolveGitHubToken({ GH_TOKEN: "ghp_from_gh_token" });
    expect(result).toEqual({ token: "ghp_from_gh_token", source: "env" });
  });

  it("resolves GITHUB_TOKEN with source: env when GH_TOKEN is absent", async () => {
    const result = await resolveGitHubToken({ GITHUB_TOKEN: "ghp_github_token" });
    expect(result).toEqual({ token: "ghp_github_token", source: "env" });
  });

  it("prefers GH_TOKEN over GITHUB_TOKEN", async () => {
    const result = await resolveGitHubToken({
      GH_TOKEN: "ghp_from_gh",
      GITHUB_TOKEN: "ghp_from_github",
    });
    expect(result).toEqual({ token: "ghp_from_gh", source: "env" });
  });

  it("resolves via gh auth token subprocess when env is empty", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "ghp_from_gh_cli\n",
      stderr: "",
    });

    const result = await resolveGitHubToken({}, { spawn });
    expect(result).toEqual({ token: "ghp_from_gh_cli", source: "gh" });
    expect(spawn).toHaveBeenCalledWith("gh", ["auth", "token"], expect.objectContaining({ timeoutMs: 5000 }));
  });

  it("falls through to credentials.json when spawn exits 1", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "not logged in",
    });
    mockLoadCredentials.mockResolvedValue({ github: { token: "ghp_stored" } });

    const result = await resolveGitHubToken({}, { spawn });
    expect(result).toEqual({ token: "ghp_stored", source: "credentials" });
  });

  it("falls through to credentials.json when spawn returns exitCode null (ENOENT)", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: null,
      stdout: "",
      stderr: "spawn gh ENOENT",
    });
    mockLoadCredentials.mockResolvedValue({ github: { token: "ghp_stored" } });

    const result = await resolveGitHubToken({}, { spawn });
    expect(result).toEqual({ token: "ghp_stored", source: "credentials" });
  });

  it("throws SpecRunnerError when no source is available", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
    mockLoadCredentials.mockResolvedValue({});

    const error = await resolveGitHubToken({}, { spawn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as { hint?: string }).hint).toContain("GH_TOKEN");
    expect((error as { hint?: string }).hint).toContain("gh auth login");
    expect((error as { hint?: string }).hint).toContain("specrunner login");
  });

  it("accepts host argument without error (type check)", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "ghp_token\n",
      stderr: "",
    });

    const result = await resolveGitHubToken({}, { host: "github.example.com", spawn });
    expect(result.source).toBe("gh");
  });
});
