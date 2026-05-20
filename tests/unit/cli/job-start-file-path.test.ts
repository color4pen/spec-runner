/**
 * Tests for job start with file path argument.
 *
 * TC-22: job start — file path 指定でのパイプライン開始
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("../../../src/core/request/store.js", () => ({
  resolve: vi.fn().mockReturnValue("/nonexistent/path"),
}));

vi.mock("../../../src/core/preflight.js", () => ({
  runPreflight: vi.fn().mockRejectedValue(new Error("preflight-stopped")),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-job-start-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

// TC-22: job start accepts file path (slug / file path 両受け)
describe("TC-22: job start — file path 指定でのパイプライン開始", () => {
  it("既存ファイルパスが指定された場合は slug lookup をスキップして preflight に進む", async () => {
    // Create a real request.md file
    const requestFile = path.join(tempDir, "my-request.md");
    await fs.writeFile(requestFile, "# Test Request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test\n- **base-branch**: main\n", "utf-8");

    const { runPreflight } = await import("../../../src/core/preflight.js");

    // Import and call runRunCore with the file path
    const { runRunCore } = await import("../../../src/cli/run.js");
    const result = await runRunCore(requestFile, { cwd: tempDir });

    // runPreflight is called (not "slug not found" error)
    // result is 1 because preflight throws, but slug lookup was NOT the cause
    expect(runPreflight).toHaveBeenCalled();
    expect(result).toBe(1);

    // Verify the error is NOT "neither a file path nor an active request slug"
    const stderrOutput = (vi.mocked(process.stderr.write).mock.calls as unknown[][])
      .map((c) => String(c[0])).join("");
    expect(stderrOutput).not.toContain("neither a file path nor an active request slug");
  });
});
