/**
 * Unit tests for SESSION_TIMEOUT lazy migration in validateJobState.
 * TC-001: SESSION_TIMEOUT → SESSION_TERMINATED in-memory mapping
 * TC-002: Other error codes are NOT remapped
 * TC-003: persist() after migration does not write SESSION_TIMEOUT to disk (should)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { validateJobState } from "../../src/state/schema.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-timeout-migration-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makeFixtureWithError(errorCode: string) {
  return {
    version: 1,
    jobId: "test-job-migration",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "spec-review",
    status: "failed",
    branch: "feat/test",
    history: [],
    error: {
      code: errorCode,
      message: `Session ${errorCode}`,
      hint: "",
    },
  };
}

function makeFixtureWithNullError() {
  return {
    version: 1,
    jobId: "test-job-no-error",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
  };
}

// TC-001: SESSION_TIMEOUT を SESSION_TERMINATED に in-memory マップする
describe("TC-001: validateJobState — SESSION_TIMEOUT を SESSION_TERMINATED に in-memory マップする", () => {
  it("error.code が SESSION_TIMEOUT の旧 state fixture を読むと SESSION_TERMINATED に変換される", () => {
    const fixture = makeFixtureWithError("SESSION_TIMEOUT");
    const state = validateJobState(fixture);
    expect(state.error?.code).toBe("SESSION_TERMINATED");
  });

  it("元の fixture オブジェクトの error.code も in-memory で SESSION_TERMINATED に変わっている", () => {
    const fixture = makeFixtureWithError("SESSION_TIMEOUT");
    validateJobState(fixture);
    // The function mutates in-place (by design — lazy migration)
    expect((fixture.error as { code: string }).code).toBe("SESSION_TERMINATED");
  });

  it("error.code が SESSION_TIMEOUT のとき、返値 state の error.code に 'SESSION_TIMEOUT' が残らない", () => {
    const fixture = makeFixtureWithError("SESSION_TIMEOUT");
    const state = validateJobState(fixture);
    // Only the code field is remapped, not the message
    expect(state.error?.code).not.toBe("SESSION_TIMEOUT");
    expect(state.error?.code).toBe("SESSION_TERMINATED");
  });
});

// TC-002: SESSION_TIMEOUT 以外の error code は変換されない
describe("TC-002: validateJobState — SESSION_TIMEOUT 以外の error code は変換しない", () => {
  it("SPEC_REVIEW_RETRIES_EXHAUSTED は変換されない", () => {
    const fixture = makeFixtureWithError("SPEC_REVIEW_RETRIES_EXHAUSTED");
    const state = validateJobState(fixture);
    expect(state.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });

  it("SESSION_TERMINATED はそのまま SESSION_TERMINATED", () => {
    const fixture = makeFixtureWithError("SESSION_TERMINATED");
    const state = validateJobState(fixture);
    expect(state.error?.code).toBe("SESSION_TERMINATED");
  });

  it("BRANCH_NOT_REGISTERED は変換されない", () => {
    const fixture = makeFixtureWithError("BRANCH_NOT_REGISTERED");
    const state = validateJobState(fixture);
    expect(state.error?.code).toBe("BRANCH_NOT_REGISTERED");
  });

  it("error が null のとき例外は発生しない", () => {
    const fixture = makeFixtureWithNullError();
    expect(() => validateJobState(fixture)).not.toThrow();
    const state = validateJobState(fixture);
    expect(state.error).toBeNull();
  });
});

// TC-003 (should): persist() 後の on-disk JSON に SESSION_TIMEOUT が含まれない
describe("TC-003 (should): lazy migration 後の persist で on-disk JSON に SESSION_TIMEOUT が残らない", () => {
  it("SESSION_TIMEOUT fixture を validateJobState 後に atomicWriteJson すると on-disk JSON に SESSION_TIMEOUT が含まれない", async () => {
    const { loadJobState } = await import("../../src/state/store.js");
    const { atomicWriteJson } = await import("../../src/util/atomic-write.js");
    const { getJobStatePath } = await import("../../src/util/xdg.js");

    // Write a fixture with SESSION_TIMEOUT directly to disk (bypass validateJobState)
    const jobId = "tc003-migration-job";
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });

    const fixtureWithTimeout = makeFixtureWithError("SESSION_TIMEOUT");
    (fixtureWithTimeout as Record<string, unknown>)["jobId"] = jobId;
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(fixtureWithTimeout, null, 2),
    );

    // Load via loadJobState (which calls validateJobState → lazy migration)
    const state = await loadJobState(jobId);

    // state.error.code should be SESSION_TERMINATED after migration
    expect(state.error?.code).toBe("SESSION_TERMINATED");

    // Persist to disk via atomicWriteJson (simulates JobStateStore.persist / store.update)
    const filePath = getJobStatePath(jobId);
    await atomicWriteJson(filePath, state);

    // Read the on-disk JSON and verify error.code is SESSION_TERMINATED (not SESSION_TIMEOUT)
    const onDisk = await fs.readFile(path.join(jobsDir, `${jobId}.json`), "utf-8");
    const parsed = JSON.parse(onDisk) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe("SESSION_TERMINATED");
    expect(parsed.error?.code).not.toBe("SESSION_TIMEOUT");
  });
});
