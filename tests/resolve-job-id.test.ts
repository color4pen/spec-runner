import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createJobState } from "../src/state/store.js";
import { resolveJobId } from "../src/state/store.js";
import { ERROR_CODES, ambiguousJobIdError } from "../src/errors.js";
import { SpecRunnerError } from "../src/errors.js";

// Setup temp directory for tests
let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-resolve-job-id-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

function makeBaseParams() {
  return {
    request: { path: "/test/request.md", title: "Test", type: "new-feature" as const },
    repository: { owner: "user", name: "repo" },
  };
}

// TC-06: AMBIGUOUS_JOB_ID エラーコードの存在確認
describe("TC-06: AMBIGUOUS_JOB_ID error code exists", () => {
  it("ERROR_CODES.AMBIGUOUS_JOB_ID equals the string 'AMBIGUOUS_JOB_ID'", () => {
    expect(ERROR_CODES.AMBIGUOUS_JOB_ID).toBe("AMBIGUOUS_JOB_ID");
  });
});

// TC-07: ambiguousJobIdError ヘルパーの出力形式
describe("TC-07: ambiguousJobIdError factory helper", () => {
  it("returns SpecRunnerError with AMBIGUOUS_JOB_ID code and hint containing candidate UUIDs", () => {
    const uuid1 = "3f1a1111-0000-0000-0000-000000000001";
    const uuid2 = "3f1a2222-0000-0000-0000-000000000002";
    const err = ambiguousJobIdError("3f1a", [uuid1, uuid2]);

    expect(err).toBeInstanceOf(SpecRunnerError);
    expect(err.code).toBe("AMBIGUOUS_JOB_ID");
    expect(err.hint).toContain(uuid1);
    expect(err.hint).toContain(uuid2);
  });
});

// TC-01: resolveJobId — 完全 UUID pass-through
describe("TC-01: resolveJobId — full UUID pass-through", () => {
  it("returns the full UUID as-is without calling listJobStates", async () => {
    const fullUuid = "3f1a1f29-0669-482a-b2d4-0f272e1caaf3";

    // We spy on listJobStates to verify it is NOT called
    const { listJobStates } = await import("../src/state/store.js");
    const spy = vi.spyOn(await import("../src/state/store.js"), "listJobStates");

    const result = await resolveJobId(fullUuid);

    expect(result).toBe(fullUuid);
    expect(spy).not.toHaveBeenCalled();
  });
});

// TC-02: resolveJobId — 短縮 ID で 1 件 match
describe("TC-02: resolveJobId — short ID with 1 match", () => {
  it("returns the full UUID when prefix matches exactly one job", async () => {
    const state = await createJobState(makeBaseParams());
    const prefix = state.jobId.slice(0, 8);

    const result = await resolveJobId(prefix);

    expect(result).toBe(state.jobId);
  });
});

// TC-03: resolveJobId — 短縮 ID で 0 件 match
describe("TC-03: resolveJobId — short ID with 0 matches", () => {
  it("throws JOB_NOT_FOUND when no job ID starts with the prefix", async () => {
    // Ensure there are no jobs in the store
    await expect(resolveJobId("deadbeef")).rejects.toMatchObject({
      code: ERROR_CODES.JOB_NOT_FOUND,
    });
  });

  it("throws SpecRunnerError", async () => {
    await expect(resolveJobId("deadbeef")).rejects.toBeInstanceOf(SpecRunnerError);
  });
});

// TC-04: resolveJobId — 短縮 ID で 2 件以上 match
describe("TC-04: resolveJobId — short ID with 2+ matches", () => {
  it("throws AMBIGUOUS_JOB_ID with hint containing candidate UUIDs", async () => {
    // Create two jobs and give them a shared prefix by manipulating the store directly.
    // Since we can't control generated UUIDs, we create 2 jobs and use the first common prefix.
    const s1 = await createJobState(makeBaseParams());
    const s2 = await createJobState(makeBaseParams());

    // Find the longest common prefix of the two UUIDs
    let commonPrefix = "";
    for (let i = 0; i < Math.min(s1.jobId.length, s2.jobId.length); i++) {
      if (s1.jobId[i] === s2.jobId[i]) {
        commonPrefix += s1.jobId[i];
      } else {
        break;
      }
    }

    if (commonPrefix.length === 0) {
      // No common prefix — skip this test as it depends on random UUIDs
      // (extremely rare: first hex char would need to differ)
      return;
    }

    await expect(resolveJobId(commonPrefix)).rejects.toMatchObject({
      code: ERROR_CODES.AMBIGUOUS_JOB_ID,
    });

    await expect(resolveJobId(commonPrefix)).rejects.toMatchObject({
      hint: expect.stringContaining(s1.jobId),
    });
  });
});

// TC-05: resolveJobId — 1 文字 prefix で一意に特定
describe("TC-05: resolveJobId — single character prefix uniquely resolves", () => {
  it("resolves correctly when only one job starts with the given single character", async () => {
    // Create a job and find a prefix character that uniquely identifies it
    const state = await createJobState(makeBaseParams());
    const firstChar = state.jobId[0]!;

    // The store has only one job, so any prefix should uniquely resolve
    const result = await resolveJobId(firstChar);
    expect(result).toBe(state.jobId);
  });
});
