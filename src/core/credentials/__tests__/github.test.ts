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

describe("resolveGitHubToken — enterprise host (B-10)", () => {
  it("resolves GH_ENTERPRISE_TOKEN for non-github.com host", async () => {
    const result = await resolveGitHubToken(
      { GH_ENTERPRISE_TOKEN: "ghe_token" },
      { host: "ghes.example.com" },
    );
    expect(result).toEqual({ token: "ghe_token", source: "env" });
  });

  it("resolves GITHUB_ENTERPRISE_TOKEN when GH_ENTERPRISE_TOKEN is absent", async () => {
    const result = await resolveGitHubToken(
      { GITHUB_ENTERPRISE_TOKEN: "ghe_token2" },
      { host: "ghes.corp.example.com" },
    );
    expect(result).toEqual({ token: "ghe_token2", source: "env" });
  });

  it("prefers GH_ENTERPRISE_TOKEN over GITHUB_ENTERPRISE_TOKEN", async () => {
    const result = await resolveGitHubToken(
      { GH_ENTERPRISE_TOKEN: "ghe_primary", GITHUB_ENTERPRISE_TOKEN: "ghe_secondary" },
      { host: "ghes.example.com" },
    );
    expect(result).toEqual({ token: "ghe_primary", source: "env" });
  });

  it("does NOT use GH_TOKEN for enterprise host (B-10)", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
    mockLoadCredentials.mockResolvedValue({});

    const error = await resolveGitHubToken(
      { GH_TOKEN: "ghp_public_token" },
      { host: "ghes.example.com", spawn },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as { hint?: string }).hint).toContain("GH_ENTERPRISE_TOKEN");
  });

  it("resolves via gh auth token --hostname for enterprise host", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "ghe_from_gh_cli\n",
      stderr: "",
    });

    const result = await resolveGitHubToken({}, { host: "ghes.example.com", spawn });
    expect(result).toEqual({ token: "ghe_from_gh_cli", source: "gh" });
    expect(spawn).toHaveBeenCalledWith(
      "gh",
      ["auth", "token", "--hostname", "ghes.example.com"],
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });

  it("github.com host uses GH_TOKEN (not enterprise vars)", async () => {
    const result = await resolveGitHubToken(
      { GH_TOKEN: "ghp_public", GH_ENTERPRISE_TOKEN: "ghe_should_not_use" },
      { host: "github.com" },
    );
    expect(result).toEqual({ token: "ghp_public", source: "env" });
  });

  it("throws with host-specific message when no enterprise token found", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
    mockLoadCredentials.mockResolvedValue({});

    const error = await resolveGitHubToken({}, { host: "ghes.example.com", spawn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const hint = (error as { hint?: string }).hint ?? "";
    expect(hint).toContain("GH_ENTERPRISE_TOKEN");
    expect(hint).toContain("ghes.example.com");
  });
});
