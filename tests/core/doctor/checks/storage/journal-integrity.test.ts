/**
 * Tests for the journal-integrity doctor check.
 *
 * JI-01: findings → fail with count + details
 * JI-02: no findings (empty repo / all clean) → pass
 * JI-03: throwing scan → pass (defensive)
 */
import { describe, it, expect, vi } from "vitest";
import {
  createJournalIntegrityCheck,
} from "../../../../../src/core/doctor/checks/storage/journal-integrity.js";
import type { JournalFinding, ScanFn } from "../../../../../src/store/journal-integrity.js";
import type { DoctorContext } from "../../../../../src/core/doctor/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): DoctorContext {
  return {
    cwd: "/fake/repo",
    env: {},
    now: new Date(),
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    fs: {
      existsSync: vi.fn().mockReturnValue(false),
      readdirSync: vi.fn().mockReturnValue([]),
      stat: vi.fn().mockResolvedValue({ mode: 0o755, isDirectory: () => true }),
      access: vi.fn().mockResolvedValue(undefined),
      constants: { W_OK: 2 } as unknown as typeof import("node:fs").constants,
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    },
    execFile: vi.fn(),
    config: { get: vi.fn(), loaded: true },
    githubClient: { verifyTokenScopes: vi.fn() },
    homeDir: "/home/user",
    processVersion: "v20.0.0",
    platform: "linux",
    resolvedGitHubToken: null,
    githubTokenSource: null,
    resolvedSpecRunnerApiKey: null,
    specRunnerApiKeySource: null,
    resolvedClaudeCodeOAuthToken: null,
    claudeCodeOAuthTokenSource: null,
    configPath: "/home/user/.config/specrunner/config.json",
  };
}

function makeCorruptFinding(slug = "my-job", location = "/repo/specrunner/changes/my-job"): JournalFinding {
  return {
    location,
    slug,
    issue: {
      kind: "corrupt-record",
      corruption: {
        lineIndex: 1,
        reason: "invalid-json",
        snippet: "CORRUPT LINE",
      },
    },
  };
}

function makeTruncatedFinding(slug = "other-job"): JournalFinding {
  return {
    location: `/repo/specrunner/changes/${slug}`,
    slug,
    issue: {
      kind: "counter-reversal",
      reversal: {
        field: "history",
        stored: 10,
        actual: 2,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// JI-01: findings → fail
// ---------------------------------------------------------------------------

describe("JI-01: journal-integrity check with findings → fail", () => {
  it("returns fail when scan finds one corrupt journal", async () => {
    const findings = [makeCorruptFinding()];
    const mockScan: ScanFn = vi.fn().mockResolvedValue(findings);
    const check = createJournalIntegrityCheck(mockScan);

    const result = await check.check(makeCtx());

    expect(result.status).toBe("fail");
    expect(result.message).toContain("1");
    expect(result.details).toBeDefined();
    expect(result.details!.length).toBe(1);
    expect(result.details![0]).toContain("corrupt record");
    expect(result.details![0]).toContain("/repo/specrunner/changes/my-job");
  });

  it("returns fail with count and all details when multiple findings exist", async () => {
    const findings = [
      makeCorruptFinding("job-a", "/repo/specrunner/changes/job-a"),
      makeTruncatedFinding("job-b"),
    ];
    const mockScan: ScanFn = vi.fn().mockResolvedValue(findings);
    const check = createJournalIntegrityCheck(mockScan);

    const result = await check.check(makeCtx());

    expect(result.status).toBe("fail");
    expect(result.message).toContain("2");
    expect(result.details).toHaveLength(2);
    // Each detail mentions the location
    expect(result.details!.some((d) => d.includes("job-a"))).toBe(true);
    expect(result.details!.some((d) => d.includes("job-b"))).toBe(true);
    // Hint mentions git restore
    expect(result.hint).toContain("git restore");
  });

  it("details include describeJournalIssue output", async () => {
    const findings = [makeTruncatedFinding("trunc-job")];
    const mockScan: ScanFn = vi.fn().mockResolvedValue(findings);
    const check = createJournalIntegrityCheck(mockScan);

    const result = await check.check(makeCtx());

    expect(result.status).toBe("fail");
    expect(result.details!.some((d) => d.includes("journal truncated"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JI-02: no findings → pass
// ---------------------------------------------------------------------------

describe("JI-02: journal-integrity check with no findings → pass", () => {
  it("returns pass when scan returns empty array", async () => {
    const mockScan: ScanFn = vi.fn().mockResolvedValue([]);
    const check = createJournalIntegrityCheck(mockScan);

    const result = await check.check(makeCtx());

    expect(result.status).toBe("pass");
    expect(result.message).toContain("No corrupt");
  });

  it("returns pass when scan resolves with no findings for an empty repo", async () => {
    const mockScan: ScanFn = vi.fn().mockResolvedValue([]);
    const check = createJournalIntegrityCheck(mockScan);

    const result = await check.check(makeCtx());

    expect(result.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// JI-03: throwing scan → pass (defensive)
// ---------------------------------------------------------------------------

describe("JI-03: journal-integrity check with throwing scan → pass", () => {
  it("returns pass when scan throws (I/O error must not corrupt doctor exit code)", async () => {
    const mockScan: ScanFn = vi.fn().mockRejectedValue(new Error("disk read error"));
    const check = createJournalIntegrityCheck(mockScan);

    const result = await check.check(makeCtx());

    expect(result.status).toBe("pass");
    expect(result.message).toContain("No corrupt");
  });
});

// ---------------------------------------------------------------------------
// Check metadata
// ---------------------------------------------------------------------------

describe("journal-integrity check metadata", () => {
  it("has name 'journal-integrity', category 'storage', required false", () => {
    const check = createJournalIntegrityCheck(vi.fn().mockResolvedValue([]));
    expect(check.name).toBe("journal-integrity");
    expect(check.category).toBe("storage");
    expect(check.required).toBe(false);
  });
});
