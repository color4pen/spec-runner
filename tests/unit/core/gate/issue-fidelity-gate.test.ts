/**
 * Unit tests for evaluateIssueFidelityGate (TC-022, TC-023, TC-024, TC-025)
 *
 * TC-022: startStep !== request-review では gate も fetch も発火しない
 *   Source: tasks.md > T-08
 *   GIVEN startStep が design など request-review 以外の step、issueNumber 設定済み
 *   WHEN evaluateIssueFidelityGate が呼ばれる
 *   THEN getIssue が呼ばれず、comparator.compare も呼ばれず、{ kind: "proceed" } が返る
 *
 * TC-023: comparator 未注入（wiring 欠落）— fail-closed halt
 *   Source: tasks.md > T-08
 *   GIVEN applicable な状況で comparator が undefined
 *   WHEN evaluateIssueFidelityGate が呼ばれる
 *   THEN { kind: "halt" } が返る（wiring error として fail-closed）
 *
 * TC-024: request.md 読み取り失敗 — fail-closed halt
 *   Source: tasks.md > T-08
 *   GIVEN readRequestMd が例外を throw する（ファイル不在 / 権限エラー）
 *   WHEN entrance gate が評価される
 *   THEN { kind: "halt" } が返る（gate を pass 扱いにしない）
 *
 * TC-025: comparator が throw — fail-closed halt
 *   Source: tasks.md > T-08
 *   GIVEN comparator.compare() が例外を throw する（LLM エラー / タイムアウト等）
 *   WHEN entrance gate が評価される
 *   THEN { kind: "halt" } が返る（pass 扱いにしない）
 */
import { describe, it, expect, vi } from "vitest";
import { evaluateIssueFidelityGate } from "../../../../src/core/gate/issue-fidelity-gate.js";
import type { IssueFidelityComparator } from "../../../../src/core/port/issue-fidelity-comparator.js";
import { ERROR_CODES } from "../../../../src/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComparator(undeclaredDrops: string[]): IssueFidelityComparator {
  return {
    compare: vi.fn().mockResolvedValue({ undeclaredDrops }),
  };
}

function makeThrowingComparator(): IssueFidelityComparator {
  return {
    compare: vi.fn().mockRejectedValue(new Error("LLM timeout")),
  };
}

function makeGetIssue(result?: { title: string; body: string }) {
  if (result) {
    return vi.fn().mockResolvedValue({ ...result, number: 875 });
  }
  return vi.fn().mockRejectedValue(new Error("GitHub API 404"));
}

function makeReadRequestMd(content?: string) {
  if (content !== undefined) {
    return vi.fn().mockResolvedValue(content);
  }
  return vi.fn().mockRejectedValue(new Error("ENOENT: request.md not found"));
}

const SAMPLE_REQUEST_MD = "# Test\n\n## Meta\n\n- **type**: new-feature\n\n## Requirements\n\n- req1\n\n## スコープ外\n\n- excluded-req\n";
const SAMPLE_ISSUE = { title: "Test Issue", body: "Issue body content" };

// ---------------------------------------------------------------------------
// TC-022: startStep !== request-review → proceed（fetch/compare 未呼び出し）
// ---------------------------------------------------------------------------

describe("TC-022: startStep !== request-review では gate も fetch も発火しない", () => {
  it("TC-022: startStep=design のとき getIssue / comparator が呼ばれず proceed が返る", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator([]);
    const log = vi.fn();

    const result = await evaluateIssueFidelityGate({
      startStep: "design",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log,
    });

    expect(result.kind).toBe("proceed");
    expect(getIssue).not.toHaveBeenCalled();
    expect(comparator.compare).not.toHaveBeenCalled();
  });

  it("TC-022: startStep=implementer のとき gate は発火しない", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator([]);

    const result = await evaluateIssueFidelityGate({
      startStep: "implementer",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("proceed");
    expect(getIssue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-023: comparator 未注入（wiring 欠落）— fail-closed halt
// ---------------------------------------------------------------------------

describe("TC-023: comparator 未注入（wiring 欠落）— fail-closed halt", () => {
  it("TC-023: applicable で comparator が undefined のとき { kind: 'halt', haltKind: 'internal-error' } が返る", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator: undefined,
      log: vi.fn(),
    });

    expect(result.kind).toBe("halt");
    if (result.kind === "halt") {
      expect(result.haltKind).toBe("internal-error");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-024: request.md 読み取り失敗 — fail-closed halt
// ---------------------------------------------------------------------------

describe("TC-024: request.md 読み取り失敗 — fail-closed halt", () => {
  it("TC-024: readRequestMd が throw するとき { kind: 'halt', haltKind: 'internal-error' } が返る（pass 扱いにしない）", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator([]);

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(), // throws
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("halt");
    if (result.kind === "halt") {
      expect(result.haltKind).toBe("internal-error");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-025: comparator が throw — fail-closed halt
// ---------------------------------------------------------------------------

describe("TC-025: comparator が throw — fail-closed halt", () => {
  it("TC-025: comparator.compare() が throw するとき { kind: 'halt', haltKind: 'internal-error' } が返る（pass 扱いにしない）", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeThrowingComparator();

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("halt");
    if (result.kind === "halt") {
      expect(result.haltKind).toBe("internal-error");
    }
  });
});

// ---------------------------------------------------------------------------
// Additional gate orchestrator edge cases (from spec.md scenarios)
// ---------------------------------------------------------------------------

describe("gate orchestrator: issueNumber == null → proceed（fetch 未呼び出し）", () => {
  it("issueNumber が null のとき getIssue を呼ばず proceed が返る（AC5）", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator([]);

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: null,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("proceed");
    expect(getIssue).not.toHaveBeenCalled();
  });

  it("issueNumber が undefined のとき getIssue を呼ばず proceed が返る（AC5）", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator([]);

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: undefined,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("proceed");
    expect(getIssue).not.toHaveBeenCalled();
  });
});

describe("gate orchestrator: inboxOrigin === true → skip、log に残る（AC6）", () => {
  it("inboxOrigin が true のとき getIssue を呼ばず proceed + skip 理由が log に出る", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator([]);
    const log = vi.fn();

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: true,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log,
    });

    expect(result.kind).toBe("proceed");
    // skip された事実と理由が log に残る
    expect(log).toHaveBeenCalled();
    const allLogCalls = log.mock.calls.flat().join(" ");
    expect(allLogCalls.length).toBeGreaterThan(0);
    // getIssue は呼ばれない
    expect(getIssue).not.toHaveBeenCalled();
    // comparator は呼ばれない
    expect(comparator.compare).not.toHaveBeenCalled();
  });
});

describe("gate orchestrator: undeclared drop ≥1 → halt（AC1）", () => {
  it("comparator が drop ≥1 を返すとき { kind: 'halt', code: ISSUE_FIDELITY_UNDECLARED_DROP, haltKind: 'undeclared-drop' } が返る", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator(["install into fixture project", "run from subdirectory"]);

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("halt");
    if (result.kind === "halt") {
      expect(result.code).toBe(ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP);
      expect(result.haltKind).toBe("undeclared-drop");
      // reason に drop が含まれる
      expect(result.reason).toContain("install into fixture project");
    }
  });

  it("halt の reason / error は issue 本文（sentinel）を含まない（AC4）", async () => {
    const SENTINEL = "SUPER_SECRET_ISSUE_BODY_SENTINEL_XYZ_9876";
    const getIssue = vi.fn().mockResolvedValue({
      number: 875,
      title: "Test",
      body: `Issue body contains ${SENTINEL}`,
    });
    const comparator = makeComparator(["missing requirement"]);
    const log = vi.fn();

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log,
    });

    expect(result.kind).toBe("halt");
    if (result.kind === "halt") {
      // issue 本文の sentinel は halt reason に含まれてはいけない
      expect(result.reason).not.toContain(SENTINEL);
    }
    // log にも sentinel が含まれない
    const allLogOutput = log.mock.calls.flat().join(" ");
    expect(allLogOutput).not.toContain(SENTINEL);
  });
});

describe("gate orchestrator: undeclared drop = 0 → proceed（AC2）", () => {
  it("comparator が空 drop を返すとき proceed が返る", async () => {
    const getIssue = makeGetIssue(SAMPLE_ISSUE);
    const comparator = makeComparator([]);

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("proceed");
  });
});

describe("gate orchestrator: getIssue throw → halt（AC7）", () => {
  it("getIssue が throw するとき { kind: 'halt', code: ISSUE_FETCH_FAILED, haltKind: 'fetch-error' } が返る", async () => {
    const getIssue = makeGetIssue(); // throws
    const comparator = makeComparator([]);

    const result = await evaluateIssueFidelityGate({
      startStep: "request-review",
      issueNumber: 875,
      inboxOrigin: false,
      owner: "testowner",
      repo: "testrepo",
      getIssue,
      readRequestMd: makeReadRequestMd(SAMPLE_REQUEST_MD),
      comparator,
      log: vi.fn(),
    });

    expect(result.kind).toBe("halt");
    if (result.kind === "halt") {
      expect(result.code).toBe(ERROR_CODES.ISSUE_FETCH_FAILED);
      expect(result.haltKind).toBe("fetch-error");
    }
  });
});
