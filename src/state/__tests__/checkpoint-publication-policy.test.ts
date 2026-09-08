import { describe, expect, it } from "vitest";
import { validateJobState } from "../schema.js";
import { shouldPublishCheckpointOnHalt } from "../helpers.js";
import { buildInitialJobState } from "../../store/job-state-store.js";

const base = () => buildInitialJobState({
  request: { path: "request.md", title: "x", type: "bug-fix", slug: "x" },
  repository: { owner: "o", name: "r" },
});

describe("checkpoint publication policy", () => {
  it("TC-012 snapshots configured false", () => {
    const state = buildInitialJobState({
      request: { path: "request.md", title: "x", type: "bug-fix", slug: "x" },
      repository: { owner: "o", name: "r" },
      checkpointPublication: { publishOnHalt: false },
    });
    expect(shouldPublishCheckpointOnHalt(state)).toBe(false);
  });

  it("TC-014 treats a legacy state as enabled", () => {
    expect(shouldPublishCheckpointOnHalt(base())).toBe(true);
  });

  it("rejects a non-boolean saved policy", () => {
    const state = { ...base(), checkpointPublication: { publishOnHalt: "yes" } };
    expect(() => validateJobState(state)).toThrow("checkpointPublication.publishOnHalt must be a boolean");
  });
});
