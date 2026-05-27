/**
 * Unit tests for stdout logger log level control.
 * TC-6.2 (updated): quiet レベルの場合 logWarn が出力しない
 * TC-6.3 (updated): default レベル以上の場合 logWarn が出力する
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { logWarn, setLogLevel } from "../../../src/logger/stdout.js";

afterEach(() => {
  // Reset to default after each test to avoid global state leakage
  setLogLevel("default");
  vi.restoreAllMocks();
});

describe("TC-6.2: setLogLevel('quiet') — logWarn は出力しない", () => {
  it("quiet レベルのとき logWarn は stderr に書き込まない", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("quiet");
    logWarn("this warning should be suppressed");
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("TC-6.3: setLogLevel('default') — logWarn は出力する", () => {
  it("default レベルのとき logWarn は stderr に書き込む", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("default");
    logWarn("this warning should appear");
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("this warning should appear"));
  });

  it("default レベルのとき logWarn のメッセージは 'Warning:' プレフィックスを含む", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("default");
    logWarn("some message");
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("Warning:"));
  });
});
