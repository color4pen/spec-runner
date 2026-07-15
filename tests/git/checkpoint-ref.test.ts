/**
 * Tests for src/git/checkpoint-ref.ts (T-03).
 *
 * TC-CR-001: single active change folder → slug derived correctly
 * TC-CR-002: 0 change folders → CHECKPOINT_NOT_FOUND
 * TC-CR-003: 2 change folders → CHECKPOINT_NOT_FOUND (ambiguous)
 * TC-CR-004: events.jsonl absent → eventsJsonl === ""
 * TC-CR-005: readCheckpointFromRef returns stateJson + treeFiles
 * TC-CR-006: layer constraint — no src/core/ or src/adapter/ imports
 */
import { describe, it, expect, vi } from "vitest";
import { resolveCheckpointSlug, readCheckpointFromRef } from "../../src/git/checkpoint-ref.js";
import { ERROR_CODES } from "../../src/errors.js";
import type { SpawnFn, SpawnResult } from "../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// Helper: build a stub SpawnFn that maps (cmd, args) → SpawnResult
// ---------------------------------------------------------------------------

function makeStubSpawn(
  responses: Map<string, Partial<SpawnResult>>,
): SpawnFn {
  return vi.fn(async (cmd: string, args: string[], _opts: { cwd: string }) => {
    const key = `${cmd} ${args.join(" ")}`;
    // Exact match first
    if (responses.has(key)) {
      const r = responses.get(key)!;
      return { exitCode: 0, stdout: "", stderr: "", ...r };
    }
    // Prefix match for dynamic refs
    for (const [k, v] of responses.entries()) {
      if (key.startsWith(k)) {
        return { exitCode: 0, stdout: "", stderr: "", ...v };
      }
    }
    // Default: success with empty output
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as SpawnFn;
}

const REF = "origin/feat/x-abc";
const SLUG = "my-feature";
const STATE_JSON = JSON.stringify({
  version: 2,
  jobId: "test-job-id-12345678",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T01:00:00.000Z",
  request: { path: "/r/specrunner/changes/my-feature/request.md", title: "T", type: "new-feature", slug: "my-feature" },
  repository: { owner: "acme", name: "repo" },
  session: null,
  step: "implementer",
  status: "awaiting-resume",
  branch: "feat/my-feature-1234abcd",
  history: [],
  error: null,
  pipelineId: "standard",
});

// ---------------------------------------------------------------------------
// TC-CR-001: single active change folder
// ---------------------------------------------------------------------------
describe("TC-CR-001: single active change folder → slug derived", () => {
  it("resolves slug when exactly one non-excluded dir has state.json", async () => {
    const responses = new Map<string, Partial<SpawnResult>>([
      [`git ls-tree --name-only ${REF} specrunner/changes/`, {
        exitCode: 0,
        stdout: `specrunner/changes/${SLUG}\nspecrunner/changes/archive\n`,
      }],
      [`git cat-file -e ${REF}:specrunner/changes/${SLUG}/state.json`, { exitCode: 0 }],
    ]);
    const slug = await resolveCheckpointSlug(makeStubSpawn(responses), "/repo", REF);
    expect(slug).toBe(SLUG);
  });
});

// ---------------------------------------------------------------------------
// TC-CR-002: 0 change folders
// ---------------------------------------------------------------------------
describe("TC-CR-002: 0 change folders → CHECKPOINT_NOT_FOUND", () => {
  it("throws CHECKPOINT_NOT_FOUND when no active folder has state.json", async () => {
    const responses = new Map<string, Partial<SpawnResult>>([
      [`git ls-tree --name-only ${REF} specrunner/changes/`, {
        exitCode: 0,
        stdout: `specrunner/changes/archive\n`,
      }],
    ]);
    await expect(
      resolveCheckpointSlug(makeStubSpawn(responses), "/repo", REF),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_FOUND });
  });

  it("throws CHECKPOINT_NOT_FOUND when ls-tree returns empty", async () => {
    const responses = new Map<string, Partial<SpawnResult>>([
      [`git ls-tree --name-only ${REF} specrunner/changes/`, { exitCode: 0, stdout: "" }],
    ]);
    await expect(
      resolveCheckpointSlug(makeStubSpawn(responses), "/repo", REF),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_FOUND });
  });
});

// ---------------------------------------------------------------------------
// TC-CR-003: 2 change folders → CHECKPOINT_NOT_FOUND (ambiguous)
// ---------------------------------------------------------------------------
describe("TC-CR-003: 2 active change folders → CHECKPOINT_NOT_FOUND (ambiguous)", () => {
  it("throws CHECKPOINT_NOT_FOUND when multiple active folders have state.json", async () => {
    const responses = new Map<string, Partial<SpawnResult>>([
      [`git ls-tree --name-only ${REF} specrunner/changes/`, {
        exitCode: 0,
        stdout: `specrunner/changes/slug-a\nspecrunner/changes/slug-b\n`,
      }],
      [`git cat-file -e ${REF}:specrunner/changes/slug-a/state.json`, { exitCode: 0 }],
      [`git cat-file -e ${REF}:specrunner/changes/slug-b/state.json`, { exitCode: 0 }],
    ]);
    await expect(
      resolveCheckpointSlug(makeStubSpawn(responses), "/repo", REF),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_FOUND });
  });
});

// ---------------------------------------------------------------------------
// TC-CR-004: events.jsonl absent → eventsJsonl === ""
// ---------------------------------------------------------------------------
describe("TC-CR-004: events.jsonl absent → eventsJsonl empty string", () => {
  it("sets eventsJsonl to empty string when events file is not present", async () => {
    const responses = new Map<string, Partial<SpawnResult>>([
      [`git ls-tree --name-only ${REF} specrunner/changes/`, {
        exitCode: 0,
        stdout: `specrunner/changes/${SLUG}\n`,
      }],
      [`git cat-file -e ${REF}:specrunner/changes/${SLUG}/state.json`, { exitCode: 0 }],
      [`git show ${REF}:specrunner/changes/${SLUG}/state.json`, {
        exitCode: 0,
        stdout: STATE_JSON,
      }],
      // events.jsonl not present → non-zero exit
      [`git show ${REF}:specrunner/changes/${SLUG}/events.jsonl`, { exitCode: 128, stdout: "" }],
      [`git ls-tree -r --name-only ${REF} -- specrunner/changes/${SLUG}/`, {
        exitCode: 0,
        stdout: `specrunner/changes/${SLUG}/state.json\nspecrunner/changes/${SLUG}/request.md\n`,
      }],
    ]);
    const result = await readCheckpointFromRef(makeStubSpawn(responses), "/repo", REF);
    expect(result.eventsJsonl).toBe("");
    expect(result.slug).toBe(SLUG);
  });
});

// ---------------------------------------------------------------------------
// TC-CR-005: readCheckpointFromRef returns stateJson + treeFiles
// ---------------------------------------------------------------------------
describe("TC-CR-005: readCheckpointFromRef returns full checkpoint data", () => {
  it("returns slug, stateJson, eventsJsonl, and treeFiles", async () => {
    const eventsContent = `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\n`;
    const responses = new Map<string, Partial<SpawnResult>>([
      [`git ls-tree --name-only ${REF} specrunner/changes/`, {
        exitCode: 0,
        stdout: `specrunner/changes/${SLUG}\n`,
      }],
      [`git cat-file -e ${REF}:specrunner/changes/${SLUG}/state.json`, { exitCode: 0 }],
      [`git show ${REF}:specrunner/changes/${SLUG}/state.json`, {
        exitCode: 0,
        stdout: STATE_JSON,
      }],
      [`git show ${REF}:specrunner/changes/${SLUG}/events.jsonl`, {
        exitCode: 0,
        stdout: eventsContent,
      }],
      [`git ls-tree -r --name-only ${REF} -- specrunner/changes/${SLUG}/`, {
        exitCode: 0,
        stdout: `specrunner/changes/${SLUG}/state.json\nspecrunner/changes/${SLUG}/events.jsonl\nspecrunner/changes/${SLUG}/request.md\n`,
      }],
    ]);
    const result = await readCheckpointFromRef(makeStubSpawn(responses), "/repo", REF);
    expect(result.slug).toBe(SLUG);
    expect(result.stateJson).toBe(STATE_JSON);
    expect(result.eventsJsonl).toBe(eventsContent);
    expect(result.treeFiles).toContain(`specrunner/changes/${SLUG}/request.md`);
    expect(result.treeFiles).toContain(`specrunner/changes/${SLUG}/state.json`);
  });
});

// ---------------------------------------------------------------------------
// TC-CR-006: layer constraint — checkpoint-ref does not import src/core/ or src/adapter/
// ---------------------------------------------------------------------------
describe("TC-CR-006: layer constraint — no src/core/ or src/adapter/ imports", () => {
  it("checkpoint-ref.ts imports are within src/git/, src/util/, src/errors only", async () => {
    const fileContent = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../src/git/checkpoint-ref.ts", import.meta.url),
        "utf-8",
      ),
    );
    // Should not import from src/core/ or src/adapter/
    expect(fileContent).not.toMatch(/from ["'].*\/core\//);
    expect(fileContent).not.toMatch(/from ["'].*\/adapter\//);
  });
});
