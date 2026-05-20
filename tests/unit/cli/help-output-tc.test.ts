/**
 * Tests for help output of the noun-verb restructured CLI.
 *
 * TC-41: --help — 主語別グルーピング（request / job / 環境系）で表示される
 * TC-43: run.ts の Hint 文が request ls を参照する（stale string なし）
 */
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const CWD = process.cwd();

// TC-41: USAGE が主語別グルーピングで出力される
describe("TC-41: --help — 主語別グルーピング表示", () => {
  it("USAGE には 'Request commands' ブロックが含まれる", async () => {
    const { USAGE } = await import("../../../src/cli/command-registry.js");
    expect(USAGE).toContain("Request commands");
  });

  it("USAGE には 'Job commands' ブロックが含まれる", async () => {
    const { USAGE } = await import("../../../src/cli/command-registry.js");
    expect(USAGE).toContain("Job commands");
  });

  it("USAGE には request 系 subcommands（new/ls/show/rm 等）が含まれる", async () => {
    const { USAGE } = await import("../../../src/cli/command-registry.js");
    expect(USAGE).toContain("request new");
    expect(USAGE).toContain("request ls");
    expect(USAGE).toContain("request show");
    expect(USAGE).toContain("request rm");
  });

  it("USAGE には job 系 subcommands（start/ls/show 等）が含まれる", async () => {
    const { USAGE } = await import("../../../src/cli/command-registry.js");
    expect(USAGE).toContain("job start");
    expect(USAGE).toContain("job ls");
    expect(USAGE).toContain("job finish");
  });

  it("USAGE には runtime subcommands が含まれる", async () => {
    const { USAGE } = await import("../../../src/cli/command-registry.js");
    expect(USAGE).toContain("runtime");
  });

  it("USAGE の Aliases には run のみが記載されている", async () => {
    const { USAGE } = await import("../../../src/cli/command-registry.js");
    expect(USAGE).toContain("run");
    // ps / resume / finish は Aliases に含まれない
    expect(USAGE).not.toMatch(/Aliases:[^]*\bps\b/s);
    expect(USAGE).not.toMatch(/Aliases:[^]*\bfinish\b/s);
  });
});

// TC-43: run.ts の slug 未解決時 Hint が 'specrunner request ls' を参照する
describe("TC-43: run.ts の Hint 文が request ls を参照", () => {
  it("run.ts ソースに 'specrunner request ls' が含まれる", async () => {
    const runSrc = path.join(CWD, "src/cli/run.ts");
    const content = await fs.readFile(runSrc, "utf-8");
    expect(content).toContain("specrunner request ls");
    expect(content).not.toContain("specrunner request list");
  });
});
