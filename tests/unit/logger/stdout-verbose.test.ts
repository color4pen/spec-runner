/**
 * Unit tests for stdout logger verbose control.
 * TC-6.2: setVerbose(false) の場合 logWarn が出力しない
 * TC-6.3: setVerbose(true) の場合 logWarn が出力する
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { logWarn, setVerbose } from "../../../src/logger/stdout.js";

afterEach(() => {
  // Reset verbose to false after each test to avoid global state leakage
  setVerbose(false);
  vi.restoreAllMocks();
});

describe("TC-6.2: setVerbose(false) — logWarn は出力しない", () => {
  it("verbose=false のとき logWarn は stderr に書き込まない", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setVerbose(false);
    logWarn("this warning should be suppressed");
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("TC-6.3: setVerbose(true) — logWarn は出力する", () => {
  it("verbose=true のとき logWarn は stderr に書き込む", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setVerbose(true);
    logWarn("this warning should appear");
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("this warning should appear"));
  });

  it("verbose=true のとき logWarn のメッセージは 'Warning:' プレフィックスを含む", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setVerbose(true);
    logWarn("some message");
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("Warning:"));
  });
});
