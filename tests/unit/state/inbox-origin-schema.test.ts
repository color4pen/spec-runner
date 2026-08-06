/**
 * TC-015: JobState.inboxOrigin の persist → load roundtrip
 * TC-016: legacy state（inboxOrigin absent）が false 相当で読める
 *
 * Source: tasks.md > T-04
 *
 * TC-015:
 *   GIVEN inboxOrigin: true を持つ JobState
 *   WHEN persist して load する
 *   THEN inboxOrigin: true が失われずに保持される
 *
 * TC-016:
 *   GIVEN inboxOrigin フィールドを持たない旧形式の state ファイル
 *   WHEN その state を load する
 *   THEN inboxOrigin は false 相当（undefined / false）として扱われる
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore, buildInitialJobState } from "../../../src/store/job-state-store.js";
import type { JobState } from "../../../src/state/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-inbox-origin-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

const JOB_ID = "aaaabbbb-0000-0000-0000-000000000099";

function makeStore(jobId: string = JOB_ID): JobStateStore {
  return new JobStateStore(jobId, tempDir, {
    changeDir: path.join(tempDir, ".specrunner", "test-jobs", jobId),
  });
}

function buildTestJobState(overrides: Partial<JobState> = {}): JobState {
  const state = buildInitialJobState({
    request: { path: "/specrunner/changes/test-slug/request.md", title: "Test", type: "new-feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
  });
  return { ...state, ...overrides };
}

// ---------------------------------------------------------------------------
// TC-015: inboxOrigin: true は persist → load roundtrip で保持される
// ---------------------------------------------------------------------------

describe("TC-015: JobState.inboxOrigin の persist → load roundtrip", () => {
  it("TC-015: inboxOrigin: true が persist → load 後に保持される", async () => {
    const store = makeStore();
    const state = buildTestJobState({ inboxOrigin: true } as Partial<JobState>);

    await store.persist(state);
    const loaded = await store.load();

    // inboxOrigin: true が失われていない
    expect((loaded as JobState & { inboxOrigin?: boolean }).inboxOrigin).toBe(true);
  });

  it("TC-015: inboxOrigin: false が persist → load 後に保持される（falsy roundtrip）", async () => {
    const store2 = new JobStateStore(JOB_ID + "1", tempDir, {
      changeDir: path.join(tempDir, ".specrunner", "test-jobs", JOB_ID + "1"),
    });
    const state = buildTestJobState({ inboxOrigin: false } as Partial<JobState>);

    await store2.persist(state);
    const loaded = await store2.load();

    const inboxOriginVal = (loaded as JobState & { inboxOrigin?: boolean }).inboxOrigin;
    // false または undefined のどちらも falsy として扱われる（backward compat）
    expect(inboxOriginVal ?? false).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-016: legacy state（inboxOrigin absent）が false 相当で読める
// ---------------------------------------------------------------------------

describe("TC-016: legacy state（inboxOrigin absent）が false 相当で読める", () => {
  it("TC-016: inboxOrigin フィールドを持たない旧形式 state を load すると inboxOrigin は falsy", async () => {
    const changeDir = path.join(tempDir, ".specrunner", "test-jobs", JOB_ID + "2");
    await fs.mkdir(changeDir, { recursive: true });

    // inboxOrigin フィールドを含まない旧形式の state.json を直接書く
    const legacyState = {
      version: 1,
      jobId: JOB_ID + "2",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/specrunner/changes/test-slug/request.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "request-review",
      status: "running",
      branch: null,
      history: [],
      error: null,
      // inboxOrigin を意図的に省略（旧形式）
    };

    await fs.writeFile(
      path.join(changeDir, "state.json"),
      JSON.stringify(legacyState, null, 2),
      "utf-8",
    );
    await fs.writeFile(path.join(changeDir, "events.jsonl"), "", "utf-8");

    const store = new JobStateStore(JOB_ID + "2", tempDir, { changeDir });
    const loaded = await store.load();

    const inboxOriginVal = (loaded as JobState & { inboxOrigin?: boolean }).inboxOrigin;
    // 旧形式では inboxOrigin は undefined（false 相当）
    expect(inboxOriginVal ?? false).toBe(false);
  });
});
