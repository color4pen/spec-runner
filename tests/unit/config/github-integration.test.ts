/**
 * Unit tests for GitHub integration config resolution.
 *
 * TC-001: Unspecified config resolves to enabled: true / source: default
 * TC-002: project-local false → enabled: false / source: project-local
 * TC-003: github.enabled: "no" (string) → CONFIG_INVALID via validateConfig
 * TC-004: user-global false only → enabled: false / source: user-global
 */
import { describe, it, expect } from "vitest";
import {
  resolveGitHubIntegrationConfig,
  traceGitHubIntegration,
} from "../../../src/config/github-integration.js";
import { validateConfig } from "../../../src/config/schema.js";
import type { SourceAwareConfigLoadResult } from "../../../src/config/store.js";

const baseConfig = { version: 1 as const, agents: {} };

/**
 * Build a minimal SourceAwareConfigLoadResult for traceGitHubIntegration.
 * Only the `migrated` field is read by the implementation.
 */
function makeLoadResult(
  projectLocalGithub: { enabled?: boolean } | null,
  userGlobalGithub: { enabled?: boolean } | null,
): SourceAwareConfigLoadResult {
  return {
    config: baseConfig,
    projectLocal: {
      migrated: projectLocalGithub !== null
        ? { github: projectLocalGithub }
        : null,
    } as SourceAwareConfigLoadResult["projectLocal"],
    userGlobal: {
      migrated: userGlobalGithub !== null
        ? { github: userGlobalGithub }
        : null,
    } as SourceAwareConfigLoadResult["userGlobal"],
  };
}

// ---------------------------------------------------------------------------
// TC-001: unspecified → enabled: true / source: default
// ---------------------------------------------------------------------------

describe("TC-001: resolveGitHubIntegrationConfig — unspecified → enabled: true", () => {
  it("returns enabled: true when github field is absent", () => {
    const result = resolveGitHubIntegrationConfig(baseConfig);
    expect(result.enabled).toBe(true);
  });

  it("returns enabled: true when github field exists but enabled is absent", () => {
    const config = { ...baseConfig, github: {} };
    const result = resolveGitHubIntegrationConfig(config);
    expect(result.enabled).toBe(true);
  });

  it("traceGitHubIntegration returns source: default when no layer declares enabled", () => {
    const result = traceGitHubIntegration(makeLoadResult(null, null));
    expect(result.enabled).toBe(true);
    expect(result.source).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// TC-002: project-local false → enabled: false / source: project-local
// ---------------------------------------------------------------------------

describe("TC-002: traceGitHubIntegration — project-local false → source: project-local", () => {
  it("returns enabled: false / source: project-local when project-local declares false", () => {
    const result = traceGitHubIntegration(makeLoadResult({ enabled: false }, null));
    expect(result.enabled).toBe(false);
    expect(result.source).toBe("project-local");
  });

  it("project-local false takes precedence over user-global true", () => {
    const result = traceGitHubIntegration(
      makeLoadResult({ enabled: false }, { enabled: true }),
    );
    expect(result.enabled).toBe(false);
    expect(result.source).toBe("project-local");
  });

  it("project-local true → enabled: true / source: project-local", () => {
    const result = traceGitHubIntegration(makeLoadResult({ enabled: true }, null));
    expect(result.enabled).toBe(true);
    expect(result.source).toBe("project-local");
  });
});

// ---------------------------------------------------------------------------
// TC-003: github.enabled: "no" (string) → CONFIG_INVALID
// ---------------------------------------------------------------------------

describe("TC-003: validateConfig — github.enabled: string → CONFIG_INVALID", () => {
  it('rejects github.enabled: "no" as CONFIG_INVALID', () => {
    const raw = { ...baseConfig, github: { enabled: "no" } };
    let caught: unknown;
    try {
      validateConfig(raw);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
  });

  it('rejects github.enabled: "true" (string) as CONFIG_INVALID', () => {
    const raw = { ...baseConfig, github: { enabled: "true" } };
    let caught: unknown;
    try {
      validateConfig(raw);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
  });

  it("accepts github.enabled: true (boolean) without throwing", () => {
    const raw = { ...baseConfig, github: { enabled: true } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts github.enabled: false (boolean) without throwing", () => {
    const raw = { ...baseConfig, github: { enabled: false } };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-004: user-global false only → enabled: false / source: user-global
// ---------------------------------------------------------------------------

describe("TC-004: traceGitHubIntegration — user-global false only → source: user-global", () => {
  it("returns enabled: false / source: user-global when only user-global declares false", () => {
    const result = traceGitHubIntegration(makeLoadResult(null, { enabled: false }));
    expect(result.enabled).toBe(false);
    expect(result.source).toBe("user-global");
  });

  it("user-global true → enabled: true / source: user-global (no project-local)", () => {
    const result = traceGitHubIntegration(makeLoadResult(null, { enabled: true }));
    expect(result.enabled).toBe(true);
    expect(result.source).toBe("user-global");
  });
});
