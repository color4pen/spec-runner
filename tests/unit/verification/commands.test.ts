/**
 * Unit tests for normalizeCommands() and spawnCommand().
 *
 * TC-CMD-01: string → { name: undefined, run: "..." }
 * TC-CMD-02: { run: "..." } → { name: undefined, run: "..." }
 * TC-CMD-03: { name: "label", run: "..." } → { name: "label", run: "..." }
 * TC-CMD-04: mixed array normalizes correctly
 * C-01: exit 0 command → exitCode 0
 * C-02: exit 1 command → exitCode 1
 * C-03: && chained commands execute via shell
 * TC-009: root が cwd と異なる場合は両方を PATH に含め cwd が先
 * TC-010: root 省略時は cwd のみ（後方互換）
 * TC-016: root === cwd のとき PATH に重複付与しない
 * TC-018: PATH の結合順序が cwd/.bin → root/.bin → 元の PATH となる
 */
import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { normalizeCommands, spawnCommand } from "../../../src/core/verification/commands.js";

describe("normalizeCommands", () => {
  it("TC-CMD-01: string → { name: undefined, run }", () => {
    const result = normalizeCommands(["ruff check"]);
    expect(result).toEqual([{ name: undefined, run: "ruff check" }]);
  });

  it("TC-CMD-02: { run } object → { name: undefined, run }", () => {
    const result = normalizeCommands([{ run: "pytest -v" }]);
    expect(result).toEqual([{ name: undefined, run: "pytest -v" }]);
  });

  it("TC-CMD-03: { name, run } object → { name, run } preserved", () => {
    const result = normalizeCommands([{ name: "lint", run: "eslint ./src" }]);
    expect(result).toEqual([{ name: "lint", run: "eslint ./src" }]);
  });

  it("TC-CMD-04: mixed array normalizes all elements correctly", () => {
    const result = normalizeCommands([
      "echo ok",
      { run: "true" },
      { name: "typecheck", run: "tsc --noEmit" },
    ]);
    expect(result).toEqual([
      { name: undefined, run: "echo ok" },
      { name: undefined, run: "true" },
      { name: "typecheck", run: "tsc --noEmit" },
    ]);
  });

  it("TC-CMD-05: empty array returns empty array", () => {
    const result = normalizeCommands([]);
    expect(result).toEqual([]);
  });
});

describe("spawnCommand", () => {
  const cwd = os.tmpdir();

  it("C-01: exit 0 command → exitCode 0", async () => {
    const { exitCode } = await spawnCommand("exit 0", cwd, process.env as Record<string, string | undefined>);
    expect(exitCode).toBe(0);
  });

  it("C-02: exit 1 command → exitCode 1", async () => {
    const { exitCode } = await spawnCommand("exit 1", cwd, process.env as Record<string, string | undefined>);
    expect(exitCode).toBe(1);
  });

  it("C-03: && chained commands execute via shell (true && true → exitCode 0)", async () => {
    const { exitCode } = await spawnCommand("true && true", cwd, process.env as Record<string, string | undefined>);
    expect(exitCode).toBe(0);
  });

  // TC-009: root が cwd と異なる場合は両方を PATH に含め cwd/.bin が先
  it("TC-009: root !== cwd → PATH に cwd/.bin と root/.bin の両方を含み cwd が先", async () => {
    const root = path.join(os.tmpdir(), "workspace-root-tc009");
    const originalPath = "/usr/bin:/bin";
    const { stdout } = await spawnCommand("echo $PATH", cwd, { PATH: originalPath }, root);
    const pathEnv = stdout.trim();
    const cwdBin = `${cwd}/node_modules/.bin`;
    const rootBin = `${root}/node_modules/.bin`;
    expect(pathEnv).toContain(cwdBin);
    expect(pathEnv).toContain(rootBin);
    // cwd's bin must appear before root's bin
    expect(pathEnv.indexOf(cwdBin)).toBeLessThan(pathEnv.indexOf(rootBin));
  });

  // TC-010: root 省略時は cwd のみ（後方互換）
  it("TC-010: root 省略時は cwd/node_modules/.bin + 元の PATH のみ（rootBin なし）", async () => {
    const root = path.join(os.tmpdir(), "workspace-root-tc010-not-used");
    const originalPath = "/usr/bin:/bin";
    const { stdout } = await spawnCommand("echo $PATH", cwd, { PATH: originalPath });
    const pathEnv = stdout.trim();
    const cwdBin = `${cwd}/node_modules/.bin`;
    const rootBin = `${root}/node_modules/.bin`;
    expect(pathEnv).toContain(cwdBin);
    // rootBin should NOT appear (root was not passed)
    expect(pathEnv).not.toContain(rootBin);
    expect(pathEnv).toBe(`${cwdBin}:${originalPath}`);
  });

  // TC-016: root === cwd のとき PATH に重複付与しない
  it("TC-016: root === cwd のとき cwd/node_modules/.bin が重複しない", async () => {
    const originalPath = "/usr/bin:/bin";
    const { stdout } = await spawnCommand("echo $PATH", cwd, { PATH: originalPath }, cwd);
    const pathEnv = stdout.trim();
    const cwdBin = `${cwd}/node_modules/.bin`;
    // cwdBin should appear exactly once
    const firstIdx = pathEnv.indexOf(cwdBin);
    const lastIdx = pathEnv.lastIndexOf(cwdBin);
    expect(firstIdx).toBe(lastIdx);
    // PATH should be cwdBin + original (no duplicate)
    expect(pathEnv).toBe(`${cwdBin}:${originalPath}`);
  });

  // TC-018: PATH の結合順序が cwd/.bin → root/.bin → 元の PATH となる
  it("TC-018: PATH 結合順序が cwd/.bin → root/.bin → 元の PATH の順になる", async () => {
    const root = path.join(os.tmpdir(), "workspace-root-tc018");
    const originalPath = "/usr/bin:/bin";
    const { stdout } = await spawnCommand("echo $PATH", cwd, { PATH: originalPath }, root);
    const pathEnv = stdout.trim();
    const cwdBin = `${cwd}/node_modules/.bin`;
    const rootBin = `${root}/node_modules/.bin`;
    const expectedPath = `${cwdBin}:${rootBin}:${originalPath}`;
    expect(pathEnv).toBe(expectedPath);
  });
});
