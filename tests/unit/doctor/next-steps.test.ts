/**
 * TC-008: 作成者相当の fail 集合に対し next steps が正順で出力される
 * TC-009: 参加者相当の fail 集合に対し next steps が正順で出力される
 * TC-010: fail ゼロのとき next steps が出力されず JSON 構造が不変
 * TC-018: github-token-present と github-token-valid が両方 fail しても specrunner login が 1 回のみ
 *
 * Source: spec.md > doctor human 出力は fail 集合から導出した next steps を末尾に示す
 */
import { describe, it, expect } from "vitest";
import { formatHuman, formatJson } from "../../../src/core/doctor/formatter.js";
import type { DoctorResult } from "../../../src/core/doctor/types.js";

// deriveNextSteps is exported from src/core/doctor/next-steps.ts (new module) or re-exported from index.ts
// Module does not exist yet — dynamic import defers the failure to test execution (RED until implementation)
async function getDeriveNextSteps(): Promise<(results: DoctorResult[]) => string[]> {
  try {
    const mod = await import("../../../src/core/doctor/index.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod as any).deriveNextSteps;
    if (typeof fn === "function") return fn;
    throw new Error("deriveNextSteps not exported from index");
  } catch {
    // Fallback: direct import from the new module
    const mod = await import("../../../src/core/doctor/next-steps.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mod as any).deriveNextSteps;
    if (typeof fn !== "function") {
      throw new Error("deriveNextSteps not found — implement src/core/doctor/next-steps.ts");
    }
    return fn;
  }
}

function makeResult(
  name: string,
  status: "pass" | "warn" | "fail",
  category: DoctorResult["category"] = "repo",
): DoctorResult {
  return { name, category, required: true, status, message: `${name}: ${status}` };
}

// ---------------------------------------------------------------------------
// TC-008: 作成者相当の fail 集合
// fail = {git-repository, github-origin, github-token-present}
// → next steps: git init → git remote add → specrunner login
// ---------------------------------------------------------------------------
describe("TC-008: 作成者相当の fail 集合で next steps が正順", () => {
  const creatorResults: DoctorResult[] = [
    makeResult("git-repository", "fail"),
    makeResult("github-origin", "fail"),
    makeResult("github-token-present", "fail", "config"),
  ];

  it("formatHuman の出力に 'Next steps' セクションが含まれる", () => {
    const output = formatHuman(creatorResults);
    expect(output).toContain("Next steps");
  });

  it("next steps に git init が含まれる", () => {
    const output = formatHuman(creatorResults);
    expect(output).toContain("git init");
  });

  it("next steps に git remote add が含まれる", () => {
    const output = formatHuman(creatorResults);
    expect(output).toContain("git remote add");
  });

  it("next steps に specrunner login が含まれる", () => {
    const output = formatHuman(creatorResults);
    expect(output).toContain("specrunner login");
  });

  it("次手順が git init → git remote add → specrunner login の順序で並ぶ", () => {
    const output = formatHuman(creatorResults);
    const gitInitIdx = output.indexOf("git init");
    const remoteAddIdx = output.indexOf("git remote add");
    const loginIdx = output.indexOf("specrunner login");
    expect(gitInitIdx).toBeGreaterThanOrEqual(0);
    expect(remoteAddIdx).toBeGreaterThanOrEqual(0);
    expect(loginIdx).toBeGreaterThanOrEqual(0);
    expect(gitInitIdx).toBeLessThan(remoteAddIdx);
    expect(remoteAddIdx).toBeLessThan(loginIdx);
  });

  it("deriveNextSteps が作成者 fail 集合から正順のステップ配列を返す", async () => {
    const deriveNextSteps = await getDeriveNextSteps();
    const steps = deriveNextSteps(creatorResults);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    const gitInitIdx = steps.findIndex((s) => s.includes("git init"));
    const remoteAddIdx = steps.findIndex((s) => s.includes("git remote add"));
    const loginIdx = steps.findIndex((s) => s.includes("specrunner login"));
    expect(gitInitIdx).toBeGreaterThanOrEqual(0);
    expect(remoteAddIdx).toBeGreaterThanOrEqual(0);
    expect(loginIdx).toBeGreaterThanOrEqual(0);
    expect(gitInitIdx).toBeLessThan(remoteAddIdx);
    expect(remoteAddIdx).toBeLessThan(loginIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-009: 参加者相当の fail 集合
// repo 系 check が全 pass、fail = {config-file-exists, github-token-present}
// → next steps: specrunner init → specrunner login
// ---------------------------------------------------------------------------
describe("TC-009: 参加者相当の fail 集合で next steps が正順", () => {
  const participantResults: DoctorResult[] = [
    makeResult("git-repository", "pass"),
    makeResult("github-origin", "pass"),
    makeResult("config-file-exists", "fail", "config"),
    makeResult("github-token-present", "fail", "config"),
  ];

  it("formatHuman の出力に 'Next steps' セクションが含まれる", () => {
    const output = formatHuman(participantResults);
    expect(output).toContain("Next steps");
  });

  it("next steps に specrunner init が含まれる", () => {
    const output = formatHuman(participantResults);
    expect(output).toContain("specrunner init");
  });

  it("next steps に specrunner login が含まれる", () => {
    const output = formatHuman(participantResults);
    expect(output).toContain("specrunner login");
  });

  it("次手順が specrunner init → specrunner login の順序で並ぶ", () => {
    const output = formatHuman(participantResults);
    const initIdx = output.indexOf("specrunner init");
    const loginIdx = output.indexOf("specrunner login");
    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(loginIdx).toBeGreaterThanOrEqual(0);
    expect(initIdx).toBeLessThan(loginIdx);
  });

  it("参加者 fail 集合では git init を next steps に出さない", () => {
    const output = formatHuman(participantResults);
    const nextStepsStart = output.indexOf("Next steps");
    if (nextStepsStart >= 0) {
      const nextStepsSection = output.slice(nextStepsStart);
      expect(nextStepsSection).not.toContain("git init");
    }
    // If "Next steps" section not found, we can't check — but the test above will catch that
  });

  it("deriveNextSteps が参加者 fail 集合から正順のステップ配列を返す", async () => {
    const deriveNextSteps = await getDeriveNextSteps();
    const steps = deriveNextSteps(participantResults);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    const initIdx = steps.findIndex((s) => s.includes("specrunner init"));
    const loginIdx = steps.findIndex((s) => s.includes("specrunner login"));
    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(loginIdx).toBeGreaterThanOrEqual(0);
    expect(initIdx).toBeLessThan(loginIdx);
    // git init should not appear
    expect(steps.some((s) => s.includes("git init"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-010: fail ゼロのとき next steps が出力されず JSON 構造が不変
// ---------------------------------------------------------------------------
describe("TC-010: fail ゼロのとき next steps 出力なし・JSON 構造不変", () => {
  it("全 pass の formatHuman 出力に 'Next steps' が含まれない", () => {
    const results: DoctorResult[] = [
      makeResult("git-repository", "pass"),
      makeResult("github-origin", "pass"),
      makeResult("config-file-exists", "pass", "config"),
      makeResult("github-token-present", "pass", "config"),
    ];
    const output = formatHuman(results);
    expect(output).not.toContain("Next steps");
  });

  it("warn のみの formatHuman 出力に 'Next steps' が含まれない", () => {
    const results: DoctorResult[] = [
      makeResult("workflow-structure", "warn"),
      makeResult("local-state-writable", "warn", "storage"),
    ];
    const output = formatHuman(results);
    expect(output).not.toContain("Next steps");
  });

  it("formatJson の出力構造に nextSteps / next_steps フィールドが含まれない", () => {
    const results: DoctorResult[] = [
      makeResult("git-repository", "pass"),
      makeResult("github-origin", "fail"),
    ];
    const parsed = JSON.parse(formatJson(results));
    expect(parsed).not.toHaveProperty("nextSteps");
    expect(parsed).not.toHaveProperty("next_steps");
    // Only summary and results keys expected at top level
    expect(Object.keys(parsed).sort()).toEqual(["results", "summary"]);
  });

  it("formatJson の summary フィールドは従来通り pass/warn/fail のみ", () => {
    const results: DoctorResult[] = [
      makeResult("a", "pass"),
      makeResult("b", "warn"),
      makeResult("c", "fail"),
    ];
    const parsed = JSON.parse(formatJson(results));
    expect(Object.keys(parsed.summary).sort()).toEqual(["fail", "pass", "warn"]);
  });

  it("deriveNextSteps が fail ゼロのとき空配列を返す", async () => {
    const deriveNextSteps = await getDeriveNextSteps();
    const results: DoctorResult[] = [
      makeResult("git-repository", "pass"),
      makeResult("github-origin", "pass"),
      makeResult("config-file-exists", "pass", "config"),
    ];
    const steps = deriveNextSteps(results);
    expect(steps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-018: github-token-present と github-token-valid が両方 fail しても
//         specrunner login は 1 回のみ
// ---------------------------------------------------------------------------
describe("TC-018: token present + valid 両方 fail でも specrunner login は 1 回のみ", () => {
  const tokenBothFailResults: DoctorResult[] = [
    makeResult("github-token-present", "fail", "config"),
    makeResult("github-token-valid", "fail", "auth"),
  ];

  it("deriveNextSteps の結果に specrunner login を含む項目がちょうど 1 つ", async () => {
    const deriveNextSteps = await getDeriveNextSteps();
    const steps = deriveNextSteps(tokenBothFailResults);
    const loginSteps = steps.filter((s) => s.includes("specrunner login"));
    expect(loginSteps.length).toBe(1);
  });

  it("formatHuman 出力の Next steps セクションで specrunner login が重複しない", () => {
    const output = formatHuman(tokenBothFailResults);
    const nextStepsStart = output.indexOf("Next steps");
    if (nextStepsStart === -1) {
      // If Next steps section is not present, the test is vacuously checking
      // something that needs to be added by implementation — let it be RED via TC-008
      return;
    }
    const nextStepsSection = output.slice(nextStepsStart);
    const loginCount = (nextStepsSection.match(/specrunner login/g) ?? []).length;
    expect(loginCount).toBe(1);
  });
});
