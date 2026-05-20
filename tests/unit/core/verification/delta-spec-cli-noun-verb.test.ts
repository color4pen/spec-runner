/**
 * Tests for delta spec files of the cli-noun-verb-restructure change.
 *
 * TC-52: delta spec — cli-commands capability の更新確認
 * TC-53: delta spec — cli-finish-command capability の更新確認
 * TC-54: delta spec — cli-resume-command capability の更新確認
 * TC-55: delta spec — managed-cli-commands capability の更新確認
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const CHANGE_FOLDER = "specrunner/changes/cli-noun-verb-restructure";
const CWD = process.cwd();

// TC-52: cli-commands delta spec に noun-verb 体系の Requirement が含まれる
describe("TC-52: delta spec — cli-commands capability の更新確認", () => {
  it("specs/cli-commands/spec.md が存在する", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/cli-commands/spec.md");
    const stat = await fs.stat(specPath);
    expect(stat.isFile()).toBe(true);
  });

  it("cli-commands/spec.md に noun-verb 体系（job / request）の Requirement が含まれる", async () => {
    const content = await fs.readFile(
      path.join(CWD, CHANGE_FOLDER, "specs/cli-commands/spec.md"),
      "utf-8",
    );
    const hasNounVerb = content.includes("job") || content.includes("request") || content.includes("noun-verb");
    expect(hasNounVerb).toBe(true);
  });
});

// TC-53: cli-finish-command delta spec に job finish の Requirement が含まれる
describe("TC-53: delta spec — cli-finish-command capability の更新確認", () => {
  it("specs/cli-finish-command/spec.md が存在する", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/cli-finish-command/spec.md");
    const stat = await fs.stat(specPath);
    expect(stat.isFile()).toBe(true);
  });

  it("cli-finish-command/spec.md に 'job finish' の記述が含まれる", async () => {
    const content = await fs.readFile(
      path.join(CWD, CHANGE_FOLDER, "specs/cli-finish-command/spec.md"),
      "utf-8",
    );
    expect(content).toContain("job finish");
  });
});

// TC-54: cli-resume-command delta spec に job resume の Requirement が含まれる
describe("TC-54: delta spec — cli-resume-command capability の更新確認", () => {
  it("specs/cli-resume-command/spec.md が存在する", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/cli-resume-command/spec.md");
    const stat = await fs.stat(specPath);
    expect(stat.isFile()).toBe(true);
  });

  it("cli-resume-command/spec.md に 'job resume' の記述が含まれる", async () => {
    const content = await fs.readFile(
      path.join(CWD, CHANGE_FOLDER, "specs/cli-resume-command/spec.md"),
      "utf-8",
    );
    expect(content).toContain("job resume");
  });
});

// TC-55: managed-cli-commands delta spec に runtime rename の Requirement が含まれる
describe("TC-55: delta spec — managed-cli-commands capability の更新確認", () => {
  it("specs/managed-cli-commands/spec.md が存在する", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/managed-cli-commands/spec.md");
    const stat = await fs.stat(specPath);
    expect(stat.isFile()).toBe(true);
  });

  it("managed-cli-commands/spec.md に 'runtime' rename の記述が含まれる", async () => {
    const content = await fs.readFile(
      path.join(CWD, CHANGE_FOLDER, "specs/managed-cli-commands/spec.md"),
      "utf-8",
    );
    expect(content).toContain("runtime");
  });
});
