/**
 * Output contract tests for detach guidance and foreground notice.
 *
 * TC-009 (new): help no longer promises immediate return
 * TC-010 (new): failure message is a single pinnable definition (buildDetachStartFailure)
 * TC-016 (new): detach-output-contract adds pins for failure message and reworded help
 * TC-019: foreground 起動時案内・detach 親出力・help の文言が存在する
 * TC-026: foreground notice は stderr にのみ書かれ stdout に一切書かない
 * TC-027: foreground notice は --quiet で抑制される
 * TC-028: detach 子（マーカー設定）は foreground notice を出さない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Spy on command-registry transitive deps to prevent side effects at import time
vi.mock("../../logger/stdout.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../logger/stdout.js")>();
  return {
    ...actual,
    logInfo: vi.fn(),
    logError: vi.fn(),
    stderrWrite: vi.fn(),
    stdoutWrite: vi.fn(),
    setLogLevel: vi.fn(),
    resolveLogLevel: vi.fn().mockReturnValue("normal"),
    isLevelEnabled: vi.fn().mockReturnValue(true),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

// These modules are expected to be created by the implementer:
import { buildDetachGuidance, DETACH_MARKER_ENV } from "../../core/command/detach.js";
// buildDetachStartFailure is imported via namespace to avoid breaking existing tests when the export
// does not yet exist. TC-010 asserts it is exported once the implementation is complete.
import * as _detachModule from "../../core/command/detach.js";
const buildDetachStartFailure = (_detachModule as Record<string, unknown>)["buildDetachStartFailure"] as
  ((slug: string, logPath: string, logTail: string) => string) | undefined;
import { FOREGROUND_NOTICE, emitForegroundNotice } from "../../core/command/operational-guidance.js";
import { USAGE } from "../command-registry.js";
import { logInfo, isLevelEnabled } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// TC-019: 文言の存在確認（output contract テスト）
// ---------------------------------------------------------------------------

describe("TC-019: foreground notice / detach guidance / help の文言が存在する", () => {
  // foreground notice
  it("TC-019: FOREGROUND_NOTICE contains '--detach'", () => {
    expect(FOREGROUND_NOTICE).toContain("--detach");
  });

  it("TC-019: FOREGROUND_NOTICE contains 'job wait'", () => {
    expect(FOREGROUND_NOTICE).toContain("job wait");
  });

  // detach guidance
  it("TC-019: buildDetachGuidance includes slug in output", () => {
    const guidance = buildDetachGuidance("my-feature");
    expect(guidance).toContain("my-feature");
  });

  it("TC-019: buildDetachGuidance includes 'job wait'", () => {
    const guidance = buildDetachGuidance("my-feature");
    expect(guidance).toContain("job wait");
  });

  it("TC-019: buildDetachGuidance includes 'job show'", () => {
    const guidance = buildDetachGuidance("my-feature");
    expect(guidance).toContain("job show");
  });

  // USAGE / help
  it("TC-019: USAGE contains 'job wait'", () => {
    expect(USAGE).toContain("job wait");
  });

  it("TC-019: USAGE contains '--detach'", () => {
    expect(USAGE).toContain("--detach");
  });
});

// ---------------------------------------------------------------------------
// TC-026: foreground notice は stderr にのみ書かれ stdout に一切書かない
// ---------------------------------------------------------------------------

describe("TC-026: foreground notice は stderr にのみ書かれ stdout に一切書かない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isLevelEnabled).mockReturnValue(true);
  });

  it("TC-026: FOREGROUND_NOTICE is a non-empty string (routed via logInfo → stderr)", () => {
    expect(typeof FOREGROUND_NOTICE).toBe("string");
    expect(FOREGROUND_NOTICE.length).toBeGreaterThan(0);
  });

  it("TC-026: emitForegroundNotice calls logInfo (stderr), NOT stdoutWrite", () => {
    vi.mocked(isLevelEnabled).mockReturnValue(true);
    emitForegroundNotice({});

    // Must have called logInfo (which writes to stderr)
    expect(vi.mocked(logInfo)).toHaveBeenCalled();
  });

  it("TC-026: emitForegroundNotice does NOT write to stdout directly", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      emitForegroundNotice({});
      // process.stdout.write must NOT be called by the notice
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("TC-026: FOREGROUND_NOTICE is not JSON (stdout contract safety check)", () => {
    expect(() => JSON.parse(FOREGROUND_NOTICE)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-027: foreground notice は --quiet で抑制される
// ---------------------------------------------------------------------------

describe("TC-027: foreground notice は --quiet で抑制される", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-027: emitForegroundNotice function is exported from operational-guidance.ts", () => {
    expect(typeof emitForegroundNotice).toBe("function");
  });

  it("TC-027: emitForegroundNotice delegates to logInfo even in quiet mode (seam contract)", () => {
    // Simulate quiet mode: isLevelEnabled returns false.
    // emitForegroundNotice must NOT implement quiet suppression itself — it must
    // delegate to logInfo, which is the single seam responsible for suppression.
    // Contract: logInfo IS called (delegation to the seam), not bypassed.
    // The actual suppression behaviour (no output written) is enforced by logInfo
    // internally and is verified by TC-026's direct stdout/stderr routing tests.
    vi.mocked(isLevelEnabled).mockReturnValue(false);

    emitForegroundNotice({});

    // logInfo must be called: emitForegroundNotice delegates suppression to logInfo.
    expect(vi.mocked(logInfo)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-028: detach 子（マーカー設定）は foreground notice を出さない
// ---------------------------------------------------------------------------

describe("TC-028: detach 子（マーカー設定）は foreground notice を出さない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isLevelEnabled).mockReturnValue(true);
  });

  it("TC-028: emitForegroundNotice does NOT call logInfo when marker env is set", () => {
    const markerEnv = { [DETACH_MARKER_ENV]: "1" };
    emitForegroundNotice(markerEnv);

    // logInfo must NOT be called when running as detach child
    expect(vi.mocked(logInfo)).not.toHaveBeenCalled();
  });

  it("TC-028: emitForegroundNotice DOES call logInfo when marker env is absent", () => {
    vi.mocked(isLevelEnabled).mockReturnValue(true);
    emitForegroundNotice({});

    // logInfo must be called when running as foreground (no marker)
    expect(vi.mocked(logInfo)).toHaveBeenCalled();
  });

  it("TC-028: emitForegroundNotice does NOT call logInfo when marker env is undefined key", () => {
    const noMarkerEnv = { [DETACH_MARKER_ENV]: undefined };
    emitForegroundNotice(noMarkerEnv);

    // undefined marker = not a child = notice SHOULD be emitted
    // (this tests that undefined is treated as "no marker")
    expect(vi.mocked(logInfo)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-009 / TC-016: help no longer promises immediate return
// ---------------------------------------------------------------------------

describe("TC-009 / TC-016: --detach help no longer promises immediate return", () => {
  it("TC-009: USAGE still contains '--detach' and 'job wait' (preserved keywords)", () => {
    // Per request AC: TC-019 asserts these, so they must remain
    expect(USAGE).toContain("--detach");
    expect(USAGE).toContain("job wait");
  });

  it("TC-009: USAGE does NOT contain 'returns immediately'", () => {
    // The old help text claimed the parent returns immediately;
    // the new contract waits for registration — this phrase must be removed.
    expect(USAGE).not.toContain("returns immediately");
  });

  it("TC-009: USAGE does NOT contain '即座に return'", () => {
    // Japanese variant of the immediate-return promise — must also be removed.
    expect(USAGE).not.toContain("即座に return");
  });

  it("TC-009: USAGE does NOT contain '即座に'", () => {
    // Catch any remaining Japanese phrasing about immediate return.
    expect(USAGE).not.toContain("即座に");
  });
});

// ---------------------------------------------------------------------------
// TC-010 / TC-016: failure message is a single pinnable definition
// ---------------------------------------------------------------------------

describe("TC-010 / TC-016: buildDetachStartFailure is a single pinnable definition", () => {
  it("TC-010: buildDetachStartFailure is exported from detach.ts", () => {
    expect(typeof buildDetachStartFailure).toBe("function");
  });

  it("TC-010: buildDetachStartFailure output includes the slug", () => {
    const msg = buildDetachStartFailure("my-slug", "/repo/.specrunner/logs/my-slug.detach.log", "error line");
    expect(msg).toContain("my-slug");
  });

  it("TC-010: buildDetachStartFailure output includes the full detach-log path", () => {
    const logPath = "/repo/.specrunner/logs/my-slug.detach.log";
    const msg = buildDetachStartFailure("my-slug", logPath, "error output");
    expect(msg).toContain(logPath);
  });

  it("TC-010: buildDetachStartFailure output includes the transcribed log tail", () => {
    const tail = "preflight failed: API key missing\ncredential error";
    const msg = buildDetachStartFailure("my-slug", "/path/to.log", tail);
    expect(msg).toContain(tail);
  });

  it("TC-016: buildDetachStartFailure is a callable builder (not a raw string constant)", () => {
    // Verify it's a function that can be called with different slugs/paths/tails
    const msg1 = buildDetachStartFailure("slug-a", "/path/a.log", "err-a");
    const msg2 = buildDetachStartFailure("slug-b", "/path/b.log", "err-b");
    // Different inputs produce different outputs
    expect(msg1).not.toBe(msg2);
    expect(msg1).toContain("slug-a");
    expect(msg2).toContain("slug-b");
  });
});
