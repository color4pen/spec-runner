/**
 * Unit tests for state I/O backward compatibility (legacy object format → array normalization).
 * TC-019: readJobState normalizes legacy object-form steps["spec-review"] to length-1 array
 * TC-048: readJobState fills missing steps field with {} (no STATE_FILE_INVALID error) (should)
 * TC-049: specrunner ps — reads legacy format in-memory, warns on stderr, does not write file (should)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toLegacyStepResult } from "../../src/state/helpers.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "state-io-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeLegacyStateRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    jobId: "legacy-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "success",
    branch: "feat/test-branch",
    history: [],
    error: null,
    ...overrides,
  };
}

async function writeStateFile(jobId: string, content: unknown): Promise<string> {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  const filePath = path.join(jobsDir, `${jobId}.json`);
  await fs.writeFile(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

// TC-019: readJobState normalizes legacy object-form steps["spec-review"] to length-1 array
describe("TC-019: validateJobState — normalizes legacy object steps to length-1 array", () => {
  it("converts object-form steps['spec-review'] to [{...obj, iteration: 1}]", async () => {
    const { validateJobState } = await import("../../src/state/schema.js");

    const legacyState = makeLegacyStateRaw({
      steps: {
        "spec-review": {
          session: { id: "sess_001", agentId: "agent_001", environmentId: "env_001" },
          verdict: "approved",
          findingsPath: "openspec/changes/test/spec-review-result.md",
          completedAt: "2026-01-01T00:00:00.000Z",
          error: null,
        },
      },
    });

    const state = validateJobState(legacyState);

    const specReviewArr = state.steps?.["spec-review"];
    expect(specReviewArr).toBeDefined();
    expect(Array.isArray(specReviewArr)).toBe(true);
    expect(specReviewArr?.length).toBe(1);

    const first = specReviewArr?.[0];
    const firstConverted = first ? toLegacyStepResult(first) : undefined;
    expect(firstConverted?.iteration).toBe(1);
    expect(firstConverted?.verdict).toBe("approved");
    expect(firstConverted?.findingsPath).toBe("openspec/changes/test/spec-review-result.md");
  });
});

// TC-048: readJobState fills missing steps field with {} (no STATE_FILE_INVALID error) (should)
describe("TC-048: validateJobState — fills missing steps field with empty object", () => {
  it("does not throw when steps field is absent", async () => {
    const { validateJobState } = await import("../../src/state/schema.js");

    const rawWithoutSteps = makeLegacyStateRaw();
    // Explicitly remove steps
    delete (rawWithoutSteps as Record<string, unknown>)["steps"];

    expect(() => validateJobState(rawWithoutSteps)).not.toThrow();
    const state = validateJobState(rawWithoutSteps);
    expect(state.steps).toEqual({});
  });
});

// TC-049: specrunner ps — reads legacy format in-memory, warns on stderr, file not rewritten (should)
describe("TC-049: listJobStates — normalizes legacy format in-memory without rewriting file", () => {
  it("returns normalized state (array format) and does not modify the file", async () => {
    const jobId = "legacy-job-id-for-ps";
    const legacyState = makeLegacyStateRaw({
      jobId,
      steps: {
        "spec-review": {
          session: null,
          verdict: "approved",
          findingsPath: null,
          completedAt: "2026-01-01T00:00:00.000Z",
          error: null,
        },
      },
    });

    const filePath = await writeStateFile(jobId, legacyState);
    const originalContent = await fs.readFile(filePath, "utf-8");

    // Import listJobStates (the ps command read path)
    const { listJobStates } = await import("../../src/state/store.js");
    const states = await listJobStates();

    // The state should be returned with normalized array format
    const found = states.find((s) => s.jobId === jobId);
    expect(found).toBeDefined();

    const specReviewArr = found?.steps?.["spec-review"];
    expect(Array.isArray(specReviewArr)).toBe(true);
    expect(specReviewArr?.length).toBe(1);
    const specReviewFirst = specReviewArr?.[0];
    expect(specReviewFirst ? toLegacyStepResult(specReviewFirst).iteration : undefined).toBe(1);

    // File should NOT have been modified (read-only path)
    const afterContent = await fs.readFile(filePath, "utf-8");
    expect(afterContent).toBe(originalContent);
  });
});
