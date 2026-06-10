/**
 * Unit tests for src/util/path-mask.ts — maskAbsolutePaths
 *
 * Covers:
 * - cwd-relative path normalization (cwd/ prefix removed)
 * - cwd standalone replaced with "."
 * - $HOME paths outside cwd replaced with "~/"
 * - homeDir standalone replaced with "~"
 * - cwd takes precedence over homeDir when cwd is inside homeDir
 * - text without absolute paths is unchanged
 * - empty cwd / homeDir guard (no over-replacement)
 */
import { describe, it, expect } from "vitest";
import { maskAbsolutePaths } from "../../../src/util/path-mask.js";

const HOME = "/home/user";
const CWD = "/home/user/projects/my-repo";

describe("maskAbsolutePaths", () => {
  it("removes cwd prefix from paths under cwd", () => {
    const text = `Error in ${CWD}/src/index.ts at line 5`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe("Error in src/index.ts at line 5");
  });

  it("replaces cwd standalone with '.'", () => {
    const text = `running in ${CWD}`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe("running in .");
  });

  it("replaces homeDir/... with ~/...", () => {
    const text = `cache at ${HOME}/.bun/install/cache`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe("cache at ~/.bun/install/cache");
  });

  it("replaces homeDir standalone with '~'", () => {
    const text = `home is ${HOME}`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe("home is ~");
  });

  it("cwd takes precedence over homeDir when cwd is inside homeDir", () => {
    // Path is under cwd → should become repo-relative, NOT ~/…/file
    const text = `${CWD}/src/util/helper.ts`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe("src/util/helper.ts");
    expect(result).not.toContain("~");
  });

  it("does not alter text that contains no absolute paths", () => {
    const text = "build passed in 1.2s\nAll tests green";
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe(text);
  });

  it("handles multiple occurrences in one string", () => {
    const text = `${CWD}/a.ts and ${CWD}/b.ts`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe("a.ts and b.ts");
  });

  it("handles mixed cwd and homeDir paths in one string", () => {
    const text = `file ${CWD}/src/main.ts config ${HOME}/.config/foo`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: HOME });
    expect(result).toBe("file src/main.ts config ~/.config/foo");
  });

  it("skips cwd replacement when cwd is empty string", () => {
    const text = `path ${HOME}/.cache/x`;
    const result = maskAbsolutePaths(text, { cwd: "", homeDir: HOME });
    // cwd empty → no cwd replacement; homeDir still applied
    expect(result).toBe("path ~/.cache/x");
  });

  it("skips homeDir replacement when homeDir is empty string", () => {
    const text = `file ${CWD}/src/a.ts`;
    const result = maskAbsolutePaths(text, { cwd: CWD, homeDir: "" });
    expect(result).toBe("file src/a.ts");
  });
});
