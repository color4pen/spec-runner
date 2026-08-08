/**
 * Resume path tests for touchedFiles persistence (TC-022 to TC-023).
 *
 * TC-022: state 往復で記録が保持される
 *   state.json への persist → composeSplitLayoutFromContent での読み出しで touchedFiles が保持される
 *
 * TC-023: resume 後の step prompt に注入される
 *   resume で読み出した state に先行 step 記録があるとき buildTouchedFilesSection が非空を返す
 */

import { describe, it, expect } from "vitest";
import { validateJobState } from "../../state/schema.js";
import { stateToStateJson, composeSplitLayoutFromContent } from "../job-state-projection.js";
import { buildTouchedFilesSection } from "../../adapter/shared/touched-files-bundle.js";
import type { JobState } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "resume-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/resume-test/request.md",
      title: "Resume Test",
      type: "bug-fix",
      slug: "resume-test",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "code-review",
    status: "running",
    branch: "feat/resume-test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as JobState;
}

// ---------------------------------------------------------------------------
// TC-022: state 往復で記録が保持される
// ---------------------------------------------------------------------------

describe("TC-022: touchedFiles survives state.json round-trip (validateJobState)", () => {
  it("touchedFiles is preserved through JSON.stringify + validateJobState cycle", () => {
    const state = makeBaseState({
      touchedFiles: {
        implementer: ["src/core/foo.ts", "src/adapter/bar.ts"],
        design: ["specrunner/changes/resume-test/design.md"],
      },
    });

    // Simulate state.json write: stateToStateJson strips history/steps
    const stateJson = stateToStateJson(state);
    const jsonStr = JSON.stringify(stateJson);

    // Simulate state.json read: JSON.parse + validateJobState
    const reparsed = JSON.parse(jsonStr) as Record<string, unknown>;
    // validateJobState normalizes the state
    reparsed["history"] = [];
    reparsed["steps"] = {};
    const loaded = validateJobState(reparsed);

    const tf = loaded.touchedFiles;

    expect(tf).toBeDefined();
    expect(tf!["implementer"]).toEqual(["src/core/foo.ts", "src/adapter/bar.ts"]);
    expect(tf!["design"]).toEqual(["specrunner/changes/resume-test/design.md"]);
  });

  it("touchedFiles is preserved through composeSplitLayoutFromContent (full resume path)", async () => {
    const state = makeBaseState({
      touchedFiles: {
        implementer: ["src/core/real.ts"],
      },
    });

    // Produce what would be written to state.json
    const stateJson = stateToStateJson(state, { slugMode: false });
    const jsonStr = JSON.stringify({ ...stateJson, history: [], steps: {} });

    // composeSplitLayoutFromContent = the real resume read path
    const { state: loaded } = await composeSplitLayoutFromContent(jsonStr, "");

    const tf = loaded.touchedFiles;

    expect(tf).toBeDefined();
    expect(tf!["implementer"]).toEqual(["src/core/real.ts"]);
  });

  it("absence of touchedFiles before persist results in absence after load (backward compat)", async () => {
    const state = makeBaseState(); // no touchedFiles

    const stateJson = stateToStateJson(state);
    const jsonStr = JSON.stringify({ ...stateJson, history: [], steps: {} });

    const { state: loaded } = await composeSplitLayoutFromContent(jsonStr, "");

    expect(loaded.touchedFiles).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-023: resume 後の step prompt に注入される
// ---------------------------------------------------------------------------

describe("TC-023: after resume, touched-files section is injected into subsequent step prompts", () => {
  it("buildTouchedFilesSection returns non-empty section from resumed state with prior records", async () => {
    const state = makeBaseState({
      touchedFiles: {
        implementer: ["src/core/foo.ts", "src/adapter/bar.ts"],
      },
    });

    // Simulate persist + resume round-trip
    const stateJson = stateToStateJson(state);
    const jsonStr = JSON.stringify({ ...stateJson, history: [], steps: {} });
    const { state: resumed } = await composeSplitLayoutFromContent(jsonStr, "");

    // code-review is the next step after resume
    const section = buildTouchedFilesSection(resumed as JobState, "code-review");

    expect(section).not.toBe("");
    expect(section).toContain("implementer");
    expect(section).toContain("src/core/foo.ts");
    expect(section).toContain("src/adapter/bar.ts");
  });

  it("section contains restriction-forbidden wording after resume", async () => {
    const state = makeBaseState({
      touchedFiles: {
        implementer: ["src/core/foo.ts"],
      },
    });

    const stateJson = stateToStateJson(state);
    const jsonStr = JSON.stringify({ ...stateJson, history: [], steps: {} });
    const { state: resumed } = await composeSplitLayoutFromContent(jsonStr, "");

    const section = buildTouchedFilesSection(resumed as JobState, "code-review");

    expect(section).toMatch(/制限してはならない|must not.*restrict|do not.*restrict|restrict.*must not/i);
  });

  it("returns empty string when resumed state has no touchedFiles (backward compat)", async () => {
    const state = makeBaseState(); // no touchedFiles

    const stateJson = stateToStateJson(state);
    const jsonStr = JSON.stringify({ ...stateJson, history: [], steps: {} });
    const { state: resumed } = await composeSplitLayoutFromContent(jsonStr, "");

    const section = buildTouchedFilesSection(resumed as JobState, "code-review");

    expect(section).toBe("");
  });

  it("change-folder paths in resumed state are not injected (defense in depth)", async () => {
    const state = makeBaseState({
      touchedFiles: {
        implementer: ["src/core/real.ts", "specrunner/changes/resume-test/design.md"],
      },
    });

    const stateJson = stateToStateJson(state);
    const jsonStr = JSON.stringify({ ...stateJson, history: [], steps: {} });
    const { state: resumed } = await composeSplitLayoutFromContent(jsonStr, "");

    const section = buildTouchedFilesSection(resumed as JobState, "code-review");

    expect(section).toContain("src/core/real.ts");
    expect(section).not.toContain("specrunner/changes/resume-test/design.md");
  });
});
