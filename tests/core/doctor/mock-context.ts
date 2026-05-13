/**
 * Shared mock DoctorContext factory for unit tests.
 * Each test can override specific fields to exercise different scenarios.
 */
import { vi } from "vitest";
import type { DoctorContext, DoctorFs, DoctorConfig, DoctorGitHubClient, ExecFileFunction } from "../../../src/core/doctor/types.js";
import * as nodeFsSync from "node:fs";

export function buildMockFs(overrides?: Partial<DoctorFs>): DoctorFs {
  return {
    stat: vi.fn().mockResolvedValue({ mode: 0o100600, isDirectory: () => false }),
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue([]),
    access: vi.fn().mockResolvedValue(undefined),
    constants: nodeFsSync.constants,
    readFile: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

export function buildMockConfig(data: Record<string, unknown> = {}): DoctorConfig {
  return {
    loaded: true,
    get(dotPath: string): unknown {
      const parts = dotPath.split(".");
      let current: unknown = data;
      for (const part of parts) {
        if (typeof current !== "object" || current === null) return undefined;
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    },
  };
}

export function buildMockGitHubClient(overrides?: Partial<DoctorGitHubClient>): DoctorGitHubClient {
  return {
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    ...overrides,
  };
}

export function buildMockExecFile(result?: { stdout: string; stderr: string }): ExecFileFunction {
  return vi.fn().mockResolvedValue(result ?? { stdout: "1.0.0\n", stderr: "" });
}

export function buildMockContext(overrides?: Partial<DoctorContext>): DoctorContext {
  return {
    cwd: "/fake/cwd",
    env: {},
    now: new Date("2026-04-30T00:00:00Z"),
    fetch: vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null } }) as unknown as typeof fetch,
    fs: buildMockFs(),
    execFile: buildMockExecFile(),
    config: buildMockConfig({
      anthropic: { apiKey: "sk-ant-test123" },
      github: { accessToken: "ghp_test123" },
      environment: { id: "env_test123" },
      agents: {
        "design": { agentId: "agent_001", definitionHash: "sha256:abc" },
        "spec-review": { agentId: "agent_002", definitionHash: "sha256:abc" },
        "spec-fixer": { agentId: "agent_003", definitionHash: "sha256:abc" },
        "implementer": { agentId: "agent_004", definitionHash: "sha256:abc" },
        "build-fixer": { agentId: "agent_005", definitionHash: "sha256:abc" },
        "code-review": { agentId: "agent_006", definitionHash: "sha256:abc" },
        "code-fixer": { agentId: "agent_007", definitionHash: "sha256:abc" },
      },
    }),
    githubClient: buildMockGitHubClient(),
    homeDir: "/fake/home",
    processVersion: "v20.0.0",
    platform: "linux" as NodeJS.Platform,
    ...overrides,
  };
}
