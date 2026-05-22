/**
 * Unit tests for src/core/command/request-create.ts
 *
 * TC-PROG-01: executeCreate — stderr outputs "Generating request.md..." before LLM call
 * TC-PROG-02: executeCreate — stderr outputs "✓ Generated <slug>" on success
 * TC-PROG-04: executeCreate — stderr outputs "✗ Failed: <message>" on error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeCreate } from "../../../src/core/command/request-create.js";
import * as manager from "../../../src/core/request/manager.js";
import type { OneShotQueryClient } from "../../../src/core/port/one-shot-query-client.js";

vi.mock("../../../src/core/request/manager.js", () => ({
  create: vi.fn().mockResolvedValue("test-slug"),
}));

const mockClient: OneShotQueryClient = {
  run: vi.fn(),
};

let stderrSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-PROG-01: executeCreate — stderr outputs "Generating request.md..."
// ---------------------------------------------------------------------------
describe("TC-PROG-01: executeCreate outputs Generating message to stderr", () => {
  it('writes "Generating request.md..." to stderr before LLM call', async () => {
    await executeCreate("some request text", { stdin: false, cwd: process.cwd() }, mockClient);

    const allStderr = stderrSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("");
    expect(allStderr).toContain("Generating request.md...");
  });
});

// ---------------------------------------------------------------------------
// TC-PROG-02: executeCreate — stderr outputs "✓ Generated <slug>" on success
// ---------------------------------------------------------------------------
describe("TC-PROG-02: executeCreate outputs success message to stderr", () => {
  it('writes "✓ Generated test-slug" to stderr on success', async () => {
    await executeCreate("some request text", { stdin: false, cwd: process.cwd() }, mockClient);

    const allStderr = stderrSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("");
    expect(allStderr).toContain("✓ Generated test-slug");
  });
});

// ---------------------------------------------------------------------------
// TC-PROG-04: executeCreate — stderr outputs "✗ Failed: ..." on error
// ---------------------------------------------------------------------------
describe("TC-PROG-04: executeCreate outputs failure message to stderr", () => {
  it('writes "✗ Failed: LLM timeout" to stderr when manager.create throws', async () => {
    vi.mocked(manager.create).mockRejectedValueOnce(new Error("LLM timeout"));

    await executeCreate("some request text", { stdin: false, cwd: process.cwd() }, mockClient);

    const allStderr = stderrSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("");
    expect(allStderr).toContain("✗ Failed: LLM timeout");
  });
});
