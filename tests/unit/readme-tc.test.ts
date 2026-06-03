/**
 * Tests for README.md noun-verb restructure content.
 *
 * TC-44: README の最短フローが新体系で記述されている
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const CWD = process.cwd();

// TC-44: README の最短フロー
describe("TC-44: README の最短フローが新体系で記述されている", () => {
  it("README.md が存在する", async () => {
    const readmePath = path.join(CWD, "README.md");
    const stat = await fs.stat(readmePath);
    expect(stat.isFile()).toBe(true);
  });

  it("README.md に 'job start' が含まれる", async () => {
    const content = await fs.readFile(path.join(CWD, "README.md"), "utf-8");
    expect(content).toContain("job start");
  });

  it("README.md に 'job ls' が含まれる", async () => {
    const content = await fs.readFile(path.join(CWD, "README.md"), "utf-8");
    expect(content).toContain("job ls");
  });

  it("README.md に 'job archive' が含まれる", async () => {
    const content = await fs.readFile(path.join(CWD, "README.md"), "utf-8");
    expect(content).toContain("job archive");
  });

  it("README.md に 'request new' が含まれる", async () => {
    const content = await fs.readFile(path.join(CWD, "README.md"), "utf-8");
    expect(content).toContain("request new");
  });

  it("README.md に 'job resume' が含まれる（失敗時フロー）", async () => {
    const content = await fs.readFile(path.join(CWD, "README.md"), "utf-8");
    expect(content).toContain("job resume");
  });

  it("README.md に run alias が記載されている", async () => {
    const content = await fs.readFile(path.join(CWD, "README.md"), "utf-8");
    expect(content).toContain("run");
  });
});
