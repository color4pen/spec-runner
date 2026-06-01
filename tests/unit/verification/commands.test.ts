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
 */
import { describe, it, expect } from "vitest";
import * as os from "node:os";
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
});
