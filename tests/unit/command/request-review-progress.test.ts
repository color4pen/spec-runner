/**
 * Unit tests for executeReview progress output in src/core/command/request-review.ts
 *
 * Isolated from request-review.test.ts to avoid vi.mock hoisting conflicts
 * with the pure-function tests (TC-RR-001 through TC-RR-010).
 *
 * TC-PROG-03: executeReview — stderr outputs "Reviewing request.md..." before LLM call
 * TC-PROG-05: executeReview — stderr outputs "✗ Failed: ..." on error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeReview } from "../../../src/core/command/request-review.js";
import * as reviewer from "../../../src/core/request/reviewer.js";
import type { OneShotQueryClient } from "../../../src/core/port/one-shot-query-client.js";

vi.mock("../../../src/core/request/reviewer.js", () => ({
  runReview: vi.fn().mockResolvedValue({
    verdict: "approve",
    findings: [],
    summary: "ok",
  }),
  parseReviewOutput: (text: string) => ({ verdict: "approve", findings: [], summary: text }),
  verdictToExitCode: (v: string) => (v === "approve" ? 0 : 1),
  buildInitialMessage: (req: string, ctx: string) => `${req}\n${ctx}`,
  formatHumanReadable: () => "approve\n",
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    "# My Request\n\n## Meta\n\n- type: new-feature\n- slug: test\n- base-branch: main\n",
  ),
}));

vi.mock("../../../src/parser/request-md.js", () => ({
  parseRequestMdContent: vi.fn().mockReturnValue({}),
}));

const mockClient: OneShotQueryClient = {
  run: vi.fn(),
};

// ---------------------------------------------------------------------------
// TC-PROG-03: executeReview — stderr outputs "Reviewing request.md..."
// ---------------------------------------------------------------------------
describe("TC-PROG-03: executeReview outputs Reviewing message to stderr", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes "Reviewing request.md..." to stderr before LLM call', async () => {
    await executeReview("dummy.md", { json: false }, mockClient);

    const allStderr = stderrSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("");
    expect(allStderr).toContain("Reviewing request.md...");
  });
});

// ---------------------------------------------------------------------------
// TC-PROG-05: executeReview — stderr outputs "✗ Failed: ..." on error
// ---------------------------------------------------------------------------
describe("TC-PROG-05: executeReview outputs failure message to stderr", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes "✗ Failed:" to stderr when runReview throws', async () => {
    vi.mocked(reviewer.runReview).mockRejectedValueOnce(new Error("Review failed"));

    await executeReview("dummy.md", { json: false }, mockClient);

    const allStderr = stderrSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("");
    expect(allStderr).toContain("✗ Failed:");
  });
});
