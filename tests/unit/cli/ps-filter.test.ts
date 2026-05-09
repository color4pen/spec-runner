/**
 * Tests for ps --status flag filtering (Phase 2).
 *
 * TC-14: ps --status awaiting-merge でフィルタ
 * TC-15: ps --status archived でフィルタ
 * TC-16: ps --status が --active より優先される
 * TC-17: ps --status が --all より優先される
 * TC-18: ps --status に無効な値を渡すとエラー
 * TC-19: ps デフォルト（引数なし）は archived を除外
 * TC-20: ps --all は archived を含む全ジョブを表示
 * TC-21: ps --status で該当ジョブが 0 件の場合
 * TC-36: 既存の ps --active 動作が変わらない
 * TC-37: --status と他フラグを組み合わせてもクラッシュしない
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runPs } from "../../../src/cli/ps.js";
import type { JobState, JobStatus } from "../../../src/state/schema.js";
import { parseFlags, FlagParseError } from "../../../src/cli/flag-parser.js";
import { COMMANDS } from "../../../src/cli/command-registry.js";

// ---------------------------------------------------------------------------
// Mock listJobStates
// ---------------------------------------------------------------------------

vi.mock("../../../src/state/store.js", () => ({
  listJobStates: vi.fn(),
}));

import { listJobStates } from "../../../src/state/store.js";

const mockedListJobStates = vi.mocked(listJobStates);

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeJob(status: JobStatus, id: string = "job-" + status): JobState {
  return {
    version: 1,
    jobId: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: `Test ${status}`, type: "feature", slug: `slug-${id}` },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status,
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

// ---------------------------------------------------------------------------
// stdout capture helper
// ---------------------------------------------------------------------------

function captureStdout(fn: () => Promise<void>): Promise<string> {
  return new Promise(async (resolve) => {
    let output = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      output += String(chunk);
      return true;
    });
    try {
      await fn();
    } finally {
      process.stdout.write = origWrite;
      vi.restoreAllMocks();
    }
    resolve(output);
  });
}

// ---------------------------------------------------------------------------
// TC-14: --status awaiting-merge でフィルタ
// ---------------------------------------------------------------------------

describe("TC-14: ps --status awaiting-merge", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("awaiting-merge", "job-am-1"),
      makeJob("awaiting-merge", "job-am-2"),
      makeJob("running", "job-run-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only awaiting-merge jobs", async () => {
    const output = await captureStdout(() => runPs({ status: "awaiting-merge" }));
    expect(output).toContain("job-am-1");
    expect(output).toContain("job-am-2");
    expect(output).not.toContain("job-run-1");
  });
});

// ---------------------------------------------------------------------------
// TC-15: --status archived でフィルタ
// ---------------------------------------------------------------------------

describe("TC-15: ps --status archived", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("archived", "job-arch-1"),
      makeJob("running", "job-run-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only archived jobs", async () => {
    const output = await captureStdout(() => runPs({ status: "archived" }));
    expect(output).toContain("job-arch-1");
    expect(output).not.toContain("job-run-1");
  });
});

// ---------------------------------------------------------------------------
// TC-16: --status が --active より優先される
// ---------------------------------------------------------------------------

describe("TC-16: ps --status が --active より優先される", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("awaiting-merge", "job-am-1"),
      makeJob("running", "job-run-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only awaiting-merge when --status=awaiting-merge --active are both set", async () => {
    const output = await captureStdout(() =>
      runPs({ status: "awaiting-merge", active: true }),
    );
    expect(output).toContain("job-am-1");
    expect(output).not.toContain("job-run-1");
  });
});

// ---------------------------------------------------------------------------
// TC-17: --status が --all より優先される
// ---------------------------------------------------------------------------

describe("TC-17: ps --status が --all より優先される", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("running", "job-run-1"),
      makeJob("archived", "job-arch-1"),
      makeJob("awaiting-merge", "job-am-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only running when --status=running --all are both set", async () => {
    const output = await captureStdout(() =>
      runPs({ status: "running", all: true }),
    );
    expect(output).toContain("job-run-1");
    expect(output).not.toContain("job-arch-1");
    expect(output).not.toContain("job-am-1");
  });
});

// ---------------------------------------------------------------------------
// TC-18: --status に無効な値を渡すとエラー
// ---------------------------------------------------------------------------

describe("TC-18: flag-parser rejects invalid --status value", () => {
  it("throws FlagParseError for --status foo", () => {
    const psDef = (COMMANDS["ps"] as { flags: Record<string, unknown> }).flags;
    expect(() =>
      parseFlags(["--status", "foo"], psDef as Parameters<typeof parseFlags>[1]),
    ).toThrow(FlagParseError);
  });

  it("error message mentions the invalid value", () => {
    const psDef = (COMMANDS["ps"] as { flags: Record<string, unknown> }).flags;
    expect(() =>
      parseFlags(["--status", "foo"], psDef as Parameters<typeof parseFlags>[1]),
    ).toThrow(/foo/);
  });
});

// ---------------------------------------------------------------------------
// TC-19: ps デフォルト（引数なし）は archived を除外
// ---------------------------------------------------------------------------

describe("TC-19: ps default excludes archived", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("running", "job-run-1"),
      makeJob("archived", "job-arch-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows running but not archived by default", async () => {
    const output = await captureStdout(() => runPs({}));
    expect(output).toContain("job-run-1");
    expect(output).not.toContain("job-arch-1");
  });
});

// ---------------------------------------------------------------------------
// TC-20: ps --all は archived を含む全ジョブを表示
// ---------------------------------------------------------------------------

describe("TC-20: ps --all includes archived", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("running", "job-run-1"),
      makeJob("archived", "job-arch-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows both running and archived with --all", async () => {
    const output = await captureStdout(() => runPs({ all: true }));
    expect(output).toContain("job-run-1");
    expect(output).toContain("job-arch-1");
  });
});

// ---------------------------------------------------------------------------
// TC-21: --status で該当ジョブが 0 件
// ---------------------------------------------------------------------------

describe("TC-21: ps --status with 0 matches", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("running", "job-run-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw when no jobs match --status=failed", async () => {
    await expect(runPs({ status: "failed" })).resolves.not.toThrow();
  });

  it("outputs no jobs found message", async () => {
    const output = await captureStdout(() => runPs({ status: "failed" }));
    expect(output).toContain("No jobs found");
  });
});

// ---------------------------------------------------------------------------
// TC-36: 既存の ps --active 動作が変わらない
// ---------------------------------------------------------------------------

describe("TC-36: ps --active backward compatibility", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("running", "job-run-1"),
      makeJob("awaiting-resume", "job-ar-1"),
      makeJob("awaiting-merge", "job-am-1"),
      makeJob("archived", "job-arch-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only ACTIVE_STATUSES jobs with --active", async () => {
    const output = await captureStdout(() => runPs({ active: true }));
    expect(output).toContain("job-run-1");
    expect(output).toContain("job-ar-1");
    expect(output).not.toContain("job-am-1");
    expect(output).not.toContain("job-arch-1");
  });
});

// ---------------------------------------------------------------------------
// TC-37: --status と他フラグを組み合わせてもクラッシュしない
// ---------------------------------------------------------------------------

describe("TC-37: --status combined with other flags does not crash", () => {
  beforeEach(() => {
    mockedListJobStates.mockResolvedValue([
      makeJob("running", "job-run-1"),
      makeJob("archived", "job-arch-1"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runPs({ status: 'running', all: true }) resolves without throwing", async () => {
    await expect(runPs({ status: "running", all: true })).resolves.not.toThrow();
  });

  it("only shows running jobs when status=running and all=true", async () => {
    const output = await captureStdout(() => runPs({ status: "running", all: true }));
    expect(output).toContain("job-run-1");
    expect(output).not.toContain("job-arch-1");
  });
});
