/**
 * Tests for getDetachLogPath() in src/util/xdg.ts.
 *
 * TC-006: detach log の path が logs ディレクトリ配下で slug から解決される
 */
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { getDetachLogPath, getVerboseLogPath, getVerboseLogDir } from "../xdg.js";

describe("TC-006: getDetachLogPath — logs dir 配下で slug から解決される", () => {
  it("TC-006: returns path under .specrunner/logs/ keyed by slug", () => {
    const result = getDetachLogPath("/repo", "foo");
    // Must be under .specrunner/logs/
    expect(result).toContain(path.join(".specrunner", "logs"));
    // Must contain the slug
    expect(result).toContain("foo");
  });

  it("TC-006: path is under getVerboseLogDir(repoRoot)", () => {
    const logDir = getVerboseLogDir("/repo");
    const result = getDetachLogPath("/repo", "foo");
    expect(result.startsWith(logDir)).toBe(true);
  });

  it("TC-006: path does not collide with getVerboseLogPath(<jobId>.log)", () => {
    // detach log uses .detach.log extension, jobId log uses .log extension
    const detachLog = getDetachLogPath("/repo", "my-slug");
    const verboseLog = getVerboseLogPath("/repo", "my-slug");
    // They must be different paths
    expect(detachLog).not.toBe(verboseLog);
    // detach log filename should not equal <slug>.log
    const detachBasename = path.basename(detachLog);
    const verboseBasename = path.basename(verboseLog);
    expect(detachBasename).not.toBe(verboseBasename);
  });

  it("TC-006: slug is the unique key (different slugs → different paths)", () => {
    const p1 = getDetachLogPath("/repo", "slug-a");
    const p2 = getDetachLogPath("/repo", "slug-b");
    expect(p1).not.toBe(p2);
    expect(p1).toContain("slug-a");
    expect(p2).toContain("slug-b");
  });

  it("TC-006: existing getVerboseLogPath is unchanged", () => {
    const result = getVerboseLogPath("/repo", "abc-job-id");
    expect(result).toBe(path.join("/repo", ".specrunner", "logs", "abc-job-id.log"));
  });
});
