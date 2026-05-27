import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";
import { logPipelineDiag } from "../diagnostic.js";
import { setLogLevel } from "../../../logger/stdout.js";

let originalDebug: string | undefined;

beforeEach(() => {
  originalDebug = process.env["SPECRUNNER_DEBUG"];
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  // logPipelineDiag requires debug level — set it for tests that verify output
  setLogLevel("debug");
});

afterEach(() => {
  if (originalDebug === undefined) {
    delete process.env["SPECRUNNER_DEBUG"];
  } else {
    process.env["SPECRUNNER_DEBUG"] = originalDebug;
  }
  setLogLevel("default");
  vi.restoreAllMocks();
});

describe("logPipelineDiag", () => {
  it("SPECRUNNER_DEBUG 未設定 → 出力なし", () => {
    delete process.env["SPECRUNNER_DEBUG"];
    logPipelineDiag("pipeline:run:entry", "jobId=test");
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it("SPECRUNNER_DEBUG=pipeline → stderr 出力あり", () => {
    process.env["SPECRUNNER_DEBUG"] = "pipeline";
    logPipelineDiag("pipeline:run:entry", "jobId=test");
    expect(process.stderr.write).toHaveBeenCalledOnce();
    const output = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(output).toContain("[pipeline-diag");
    expect(output).toContain("pipeline:run:entry");
    expect(output).toContain("jobId=test");
  });

  it("SPECRUNNER_DEBUG=pipeline,other → stderr 出力あり", () => {
    process.env["SPECRUNNER_DEBUG"] = "pipeline,other";
    logPipelineDiag("pipeline:step:pre-execute", "step=design");
    expect(process.stderr.write).toHaveBeenCalledOnce();
  });

  it("SPECRUNNER_DEBUG=other → 出力なし", () => {
    process.env["SPECRUNNER_DEBUG"] = "other";
    logPipelineDiag("pipeline:run:entry");
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it("detail あり → フォーマットに detail が含まれる", () => {
    process.env["SPECRUNNER_DEBUG"] = "pipeline";
    logPipelineDiag("pipeline:terminal", "step=spec-review, terminal=end");
    const output = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(output).toMatch(/\[pipeline-diag .+\] pipeline:terminal: step=spec-review, terminal=end\n/);
  });

  it("detail なし → フォーマットに point のみ含まれる", () => {
    process.env["SPECRUNNER_DEBUG"] = "pipeline";
    logPipelineDiag("pipeline:loop:exhausted");
    const output = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(output).toMatch(/\[pipeline-diag .+\] pipeline:loop:exhausted\n/);
    expect(output).not.toContain(": undefined");
  });

  it("debug レベル未設定時は SPECRUNNER_DEBUG=pipeline があっても出力されない", () => {
    setLogLevel("default");
    process.env["SPECRUNNER_DEBUG"] = "pipeline";
    logPipelineDiag("pipeline:run:entry", "jobId=test");
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it("verbose レベルでは SPECRUNNER_DEBUG=pipeline があっても出力されない", () => {
    setLogLevel("verbose");
    process.env["SPECRUNNER_DEBUG"] = "pipeline";
    logPipelineDiag("pipeline:run:entry", "jobId=test");
    expect(process.stderr.write).not.toHaveBeenCalled();
  });
});
