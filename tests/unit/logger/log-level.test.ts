/**
 * Unit tests for LogLevel system.
 *
 * TC-01 ~ TC-13: resolveLogLevel — CLI flags and env var priority
 * TC-14 ~ TC-23: isLevelEnabled / log function gate conditions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveLogLevel,
  setLogLevel,
  isLevelEnabled,
  logError,
  logWarn,
  logInfo,
  logStep,
  logSuccess,
  logDebug,
} from "../../../src/logger/stdout.js";

let originalLogLevel: string | undefined;
let originalDebug: string | undefined;

beforeEach(() => {
  originalLogLevel = process.env["SPECRUNNER_LOG_LEVEL"];
  originalDebug = process.env["DEBUG"];
  delete process.env["SPECRUNNER_LOG_LEVEL"];
  delete process.env["DEBUG"];
  setLogLevel("default");
});

afterEach(() => {
  if (originalLogLevel !== undefined) {
    process.env["SPECRUNNER_LOG_LEVEL"] = originalLogLevel;
  } else {
    delete process.env["SPECRUNNER_LOG_LEVEL"];
  }
  if (originalDebug !== undefined) {
    process.env["DEBUG"] = originalDebug;
  } else {
    delete process.env["DEBUG"];
  }
  setLogLevel("default");
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// resolveLogLevel — CLI flag priority
// ---------------------------------------------------------------------------

describe("TC-01: resolveLogLevel({ debug: true }) → 'debug'", () => {
  it("returns 'debug' when debug flag is true", () => {
    expect(resolveLogLevel({ debug: true })).toBe("debug");
  });
});

describe("TC-02: resolveLogLevel({ verbose: true }) → 'verbose'", () => {
  it("returns 'verbose' when verbose flag is true", () => {
    expect(resolveLogLevel({ verbose: true })).toBe("verbose");
  });
});

describe("TC-03: resolveLogLevel({ quiet: true }) → 'quiet'", () => {
  it("returns 'quiet' when quiet flag is true", () => {
    expect(resolveLogLevel({ quiet: true })).toBe("quiet");
  });
});

describe("TC-04: resolveLogLevel({}) → 'default' with no env", () => {
  it("returns 'default' when no flags or env vars set", () => {
    expect(resolveLogLevel({})).toBe("default");
  });
});

describe("TC-05: debug flag wins over verbose and quiet", () => {
  it("returns 'debug' when debug, verbose, quiet are all true", () => {
    expect(resolveLogLevel({ debug: true, verbose: true, quiet: true })).toBe("debug");
  });
});

describe("TC-06: verbose flag wins over quiet", () => {
  it("returns 'verbose' when verbose and quiet are both true", () => {
    expect(resolveLogLevel({ verbose: true, quiet: true })).toBe("verbose");
  });
});

// ---------------------------------------------------------------------------
// resolveLogLevel — env var fallback
// ---------------------------------------------------------------------------

describe("TC-07: SPECRUNNER_LOG_LEVEL=quiet → 'quiet'", () => {
  it("returns 'quiet' from env var", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "quiet";
    expect(resolveLogLevel({})).toBe("quiet");
  });
});

describe("TC-08: SPECRUNNER_LOG_LEVEL=verbose → 'verbose'", () => {
  it("returns 'verbose' from env var", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "verbose";
    expect(resolveLogLevel({})).toBe("verbose");
  });
});

describe("TC-09: SPECRUNNER_LOG_LEVEL=debug → 'debug'", () => {
  it("returns 'debug' from env var", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "debug";
    expect(resolveLogLevel({})).toBe("debug");
  });
});

describe("TC-10: DEBUG env var → 'debug'", () => {
  it("returns 'debug' when DEBUG env var is set", () => {
    process.env["DEBUG"] = "*";
    expect(resolveLogLevel({})).toBe("debug");
  });
});

describe("TC-11: CLI flag wins over SPECRUNNER_LOG_LEVEL", () => {
  it("quiet flag overrides SPECRUNNER_LOG_LEVEL=verbose", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "verbose";
    expect(resolveLogLevel({ quiet: true })).toBe("quiet");
  });
});

describe("TC-12: CLI flag wins over DEBUG env var", () => {
  it("quiet flag overrides DEBUG=*", () => {
    process.env["DEBUG"] = "*";
    expect(resolveLogLevel({ quiet: true })).toBe("quiet");
  });
});

describe("TC-13: unknown SPECRUNNER_LOG_LEVEL falls back to default", () => {
  it("returns 'default' for unknown env var value", () => {
    process.env["SPECRUNNER_LOG_LEVEL"] = "info";
    expect(resolveLogLevel({})).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// isLevelEnabled
// ---------------------------------------------------------------------------

describe("isLevelEnabled", () => {
  it("quiet: only quiet is enabled", () => {
    setLogLevel("quiet");
    expect(isLevelEnabled("quiet")).toBe(true);
    expect(isLevelEnabled("default")).toBe(false);
    expect(isLevelEnabled("verbose")).toBe(false);
    expect(isLevelEnabled("debug")).toBe(false);
  });

  it("default: quiet and default are enabled", () => {
    setLogLevel("default");
    expect(isLevelEnabled("quiet")).toBe(true);
    expect(isLevelEnabled("default")).toBe(true);
    expect(isLevelEnabled("verbose")).toBe(false);
    expect(isLevelEnabled("debug")).toBe(false);
  });

  it("verbose: quiet, default, verbose are enabled", () => {
    setLogLevel("verbose");
    expect(isLevelEnabled("quiet")).toBe(true);
    expect(isLevelEnabled("default")).toBe(true);
    expect(isLevelEnabled("verbose")).toBe(true);
    expect(isLevelEnabled("debug")).toBe(false);
  });

  it("debug: all levels are enabled", () => {
    setLogLevel("debug");
    expect(isLevelEnabled("quiet")).toBe(true);
    expect(isLevelEnabled("default")).toBe(true);
    expect(isLevelEnabled("verbose")).toBe(true);
    expect(isLevelEnabled("debug")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-14: logError always outputs
// ---------------------------------------------------------------------------

describe("TC-14: logError outputs at quiet level", () => {
  it("logError writes to stderr even in quiet mode", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("quiet");
    logError("fatal error");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("fatal error"));
  });
});

// ---------------------------------------------------------------------------
// TC-15 & TC-16: logWarn
// ---------------------------------------------------------------------------

describe("TC-15: logWarn outputs at default level", () => {
  it("logWarn writes to stderr at default level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("default");
    logWarn("something deprecated");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("something deprecated"));
  });
});

describe("TC-16: logWarn suppressed at quiet level", () => {
  it("logWarn does not write at quiet level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("quiet");
    logWarn("warning");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-17 & TC-18: logInfo
// ---------------------------------------------------------------------------

describe("TC-17: logInfo outputs at default level", () => {
  it("logInfo writes to stderr at default level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("default");
    logInfo("processing...");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("processing..."));
  });
});

describe("TC-18: logInfo suppressed at quiet level", () => {
  it("logInfo does not write at quiet level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("quiet");
    logInfo("step info");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-19: logStep suppressed at quiet
// ---------------------------------------------------------------------------

describe("TC-19: logStep suppressed at quiet level", () => {
  it("logStep does not write at quiet level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("quiet");
    logStep("compiling");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-20: logSuccess suppressed at quiet
// ---------------------------------------------------------------------------

describe("TC-20: logSuccess suppressed at quiet level", () => {
  it("logSuccess does not write at quiet level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("quiet");
    logSuccess("done");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-21 & TC-22 & TC-23: logDebug
// ---------------------------------------------------------------------------

describe("TC-21: logDebug outputs at debug level", () => {
  it("logDebug writes to stderr at debug level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("debug");
    logDebug("internal state");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("internal state"));
  });
});

describe("TC-22: logDebug suppressed at verbose level", () => {
  it("logDebug does not write at verbose level", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("verbose");
    logDebug("internal state");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("TC-23: logDebug suppressed at default level", () => {
  it("logDebug does not write at default level (no DEBUG env)", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("default");
    logDebug("internal state");
    expect(spy).not.toHaveBeenCalled();
  });
});
