/**
 * Unit tests for runVerification() commands path.
 *
 * TC-VR-01: commands path — all commands passed → verdict passed
 * TC-VR-02: commands path — 2nd failed → 3rd skipped, verdict failed
 * TC-VR-03: commands path — name present → label used in phase field
 * TC-VR-04: commands path — name absent → command string used in phase field
 * TC-VR-05: commands undefined → phase fallback activated (VERIFICATION_NO_RUNNABLE_PHASES in empty cwd)
 * TC-VR-06: verification section exists but commands undefined → phase fallback
 * TC-VR-E01: failure output contains "Step '<name>' failed" when name is defined (E-01)
 * TC-VR-E02: failure output contains "Step '<command>' failed" when name is absent (E-02)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runVerification } from "../../../src/core/verification/runner.js";

let tmpDir: string;
const TEST_SLUG = "test-slug";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-test-"));
  // Create the directory structure expected by verificationResultPath
  await fs.mkdir(path.join(tmpDir, "specrunner", "changes", TEST_SLUG), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("TC-VR-01: commands path — all commands passed → verdict passed", () => {
  it("all commands exit 0 → verdict passed, all statuses passed", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["true", { run: "echo ok" }],
    });

    expect(result.verdict).toBe("passed");
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0]?.status).toBe("passed");
    expect(result.phases[1]?.status).toBe("passed");
  });
});

describe("TC-VR-02: commands path — 2nd failed → 3rd skipped, verdict failed", () => {
  it("1st passed, 2nd failed, 3rd skipped → verdict failed", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["true", "false", "echo after"],
    });

    expect(result.verdict).toBe("failed");
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0]?.status).toBe("passed");
    expect(result.phases[1]?.status).toBe("failed");
    expect(result.phases[2]?.status).toBe("skipped");
  });
});

describe("TC-VR-03: commands path — name present → label used in phase field", () => {
  it("phase field shows name when name is defined", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: [{ name: "lint", run: "false" }],
    });

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]?.phase).toBe("lint");
  });
});

describe("TC-VR-04: commands path — name absent → command string used in phase field", () => {
  it("phase field shows command string when name is undefined", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["ruff check || true"],
    });

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]?.phase).toBe("ruff check || true");
  });
});

describe("TC-VR-05: commands undefined → phase fallback activated", () => {
  it("commands undefined → falls back to phase detection (no scripts → VERIFICATION_NO_RUNNABLE_PHASES)", async () => {
    // cwd has no package.json → all phases skipped → VERIFICATION_NO_RUNNABLE_PHASES
    const result = await runVerification(TEST_SLUG, tmpDir, undefined);

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("VERIFICATION_NO_RUNNABLE_PHASES");
    // All phases should be skipped (no package.json → all scripts missing)
    for (const phase of result.phases) {
      expect(phase.status).toBe("skipped");
    }
  });
});

describe("TC-VR-06: verification section exists but commands undefined → phase fallback", () => {
  it("empty verification object (no commands key) → phase fallback", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, {});

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("VERIFICATION_NO_RUNNABLE_PHASES");
  });
});

describe("TC-VR-07: empty commands array → VERIFICATION_NO_RUNNABLE_PHASES", () => {
  it("empty commands array → all skipped → verdict failed", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, { commands: [] });

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("VERIFICATION_NO_RUNNABLE_PHASES");
    expect(result.phases).toHaveLength(0);
  });
});

describe("TC-VR-E01: failure output contains \"Step '<name>' failed\" when name is defined (E-01)", () => {
  it("name='type' command fails → verification-result.md contains \"Step 'type' failed\"", async () => {
    await runVerification(TEST_SLUG, tmpDir, {
      commands: [{ name: "type", run: "false" }],
    });

    const resultPath = path.join(
      tmpDir,
      "specrunner",
      "changes",
      TEST_SLUG,
      "verification-result.md",
    );
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("Step 'type' failed");
  });
});

describe("TC-VR-E02: failure output contains \"Step '<command>' failed\" when name is absent (E-02)", () => {
  it("string command 'false' fails → verification-result.md contains \"Step 'false' failed\"", async () => {
    await runVerification(TEST_SLUG, tmpDir, {
      commands: ["false"],
    });

    const resultPath = path.join(
      tmpDir,
      "specrunner",
      "changes",
      TEST_SLUG,
      "verification-result.md",
    );
    const content = await fs.readFile(resultPath, "utf-8");
    // The phase label for a string command with no name is the command string itself
    expect(content).toContain("Step 'false' failed");
  });
});

// TC-VR-SK-G1: commands path ignores skip keyword in output — no skippedCount, no annotation
describe("TC-VR-SK-G1: commands path — output with skip keyword → no skippedCount, no annotation", () => {
  it("command outputs '2 skipped' and exits 0 → phases carry no skippedCount, result.md has no skip annotation", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ['echo "2 skipped"'],
    });

    expect(result.verdict).toBe("passed");
    for (const phase of result.phases) {
      expect((phase as { skippedCount?: number }).skippedCount).toBeUndefined();
    }

    const resultPath = path.join(
      tmpDir,
      "specrunner",
      "changes",
      TEST_SLUG,
      "verification-result.md",
    );
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).not.toContain("passed with skips");
  });
});

// TC-VR-SK-G2: VERIFICATION_NO_RUNNABLE_PHASES → verdict failed, no skip annotation
describe("TC-VR-SK-G2: VERIFICATION_NO_RUNNABLE_PHASES → verdict failed, no skip annotation in result.md", () => {
  it("empty commands array → VERIFICATION_NO_RUNNABLE_PHASES, no skip annotation written", async () => {
    const result = await runVerification(TEST_SLUG, tmpDir, { commands: [] });

    expect(result.verdict).toBe("failed");
    expect(result.errorCode).toBe("VERIFICATION_NO_RUNNABLE_PHASES");

    const resultPath = path.join(
      tmpDir,
      "specrunner",
      "changes",
      TEST_SLUG,
      "verification-result.md",
    );
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).not.toContain("passed with skips");
    expect(content).toMatch(/^## Verdict: failed$/m);
  });
});
