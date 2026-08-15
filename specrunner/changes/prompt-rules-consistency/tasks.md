# Tasks: prompt/rules の新 pipeline 構造への追随

## T-01: implementer-system.ts の authority 表現を 4 層に更新し test_cases_skipped 記録先を修正する

対象ファイル: `src/prompts/implementer-system.ts`

- [ ] `IMPLEMENTER_BASE` の `## Contract` 節の `**入力**:` ブロック（現行 line 20-23）を以下の 4 層構造に置換する:
  ```
  **入力（4 層）**:
  - `specrunner/changes/<slug>/request.md` / `spec.md` — **依頼意図の正典（normative）**: テストと実装はこれに整合させる責務がある。逸脱は finding
  - `specrunner/changes/<slug>/test-cases.md` — **レビュー済みの検証契約**: must TC をすべてテストコードに実体化する
  - `specrunner/changes/<slug>/tasks.md` — **実装の作業計画**: 実装すべきタスクを列挙する
  - `specrunner/changes/<slug>/design.md` — **設計根拠・文脈**（read-only）
  ```
  「唯一のインプット」という文言が残らないこと。`spec.md` / `design.md` / `test-cases.md` — 参照情報（read-only）という旧記述を削除する。
- [ ] 現行 line 59 の `commit message に \`test_cases_skipped: [TC-ID — 理由]\` の形式で明示的に記録する` を `完了報告（completion report）に \`test_cases_skipped: [TC-ID — 理由]\` の形式で明示的に記録する` に変更する（「commit message」→「完了報告（completion report）」）。

**Acceptance Criteria**:
- `IMPLEMENTER_SYSTEM_PROMPT` に `request.md` / `spec.md` = normative の記述が含まれる
- `IMPLEMENTER_SYSTEM_PROMPT` に `test-cases.md` = レビュー済みの検証契約 の記述が含まれる
- `IMPLEMENTER_SYSTEM_PROMPT` に `tasks.md` = 実装の作業計画 の記述が含まれる
- `IMPLEMENTER_SYSTEM_PROMPT` に「唯一のインプット」が含まれない
- `IMPLEMENTER_SYSTEM_PROMPT` に「commit message」と「test_cases_skipped」が同一文内に含まれない
- `IMPLEMENTER_SYSTEM_PROMPT` に「完了報告」と「test_cases_skipped」が同一文内に含まれる

---

## T-02: rules.ts の session 独立性記述に verification continuation 例外を追加する

対象ファイル: `src/prompts/rules.ts`

- [ ] `RULES_MD_CONTENT` 内の `### Pipeline Structure` 節の現行記述:
  ```
  各 step は独立した agent session として実行される。前の session の文脈を持たない（各 step は新規セッションで実行される）。
  CLI (StepExecutor) がオーケストレーションを担当し、step 間の連携は artifact ファイル経由で行われる。
  ```
  を以下に置換する:
  ```
  原則: 各 step は独立した新規 session（前の session の文脈を持たない）として実行される。
  例外: verification 失敗後の implementer 再入は、直前の implementer session の continuation として実行される（session が無い場合は fresh session に fallback）。
  CLI (StepExecutor) がオーケストレーションを担当し、step 間の連携は artifact ファイル経由で行われる。
  ```

**Acceptance Criteria**:
- `RULES_MD_CONTENT` に「verification 失敗後の implementer 再入」という文言が含まれる
- `RULES_MD_CONTENT` に「continuation」という文言が含まれる
- `RULES_MD_CONTENT` に「fresh session に fallback」という文言が含まれる
- 既存の TC-003 / TC-009（PIPELINE_MAP を toContain で参照）が引き続き green になる

---

## T-03: pipeline-map.ts に bite-evidence 行を追加し conformance 行を更新する

対象ファイル: `src/prompts/pipeline-map.ts`

- [ ] `implementer` 行と `verification` 行の間に以下の行を追加する:
  ```
  | bite-evidence | Evidence Base（job 開始時点の実装 + candidate のテスト）上で red→green を機械実行し、テストが変更に噛むことを証明する（CLI step） |
  ```
- [ ] `conformance` 行を以下に置換する（「4 成果物」の旧記述を削除）:
  ```
  | conformance | request / spec を規範（normative）、design / tasks を計画（plan）として適合性を検証する |
  ```

**Acceptance Criteria**:
- `PIPELINE_MAP` に `bite-evidence` 行が存在する
- `PIPELINE_MAP` の行内で `bite-evidence` が `implementer` より後かつ `verification` より前の位置にある
- `PIPELINE_MAP` に「Evidence Base」という文言が含まれる
- `PIPELINE_MAP` の `conformance` 行に「normative」「plan」という文言が含まれる
- `PIPELINE_MAP` の `conformance` 行に「4 成果物」という旧文言が含まれない
- `PIPELINE_MAP` のデータ行数が 15 になる

---

## T-04: resolve-step.ts の path 4（stateStep）に LEGACY_STEP_ALIASES を適用する

対象ファイル: `src/core/resume/resolve-step.ts`

- [ ] `resolveResumeStep` 関数内の path 4 ブロック（現行の `if (stateStep !== undefined && allowed.has(stateStep)) {` から `return toStepName(stateStep);` まで）を以下に置換する:
  ```typescript
  if (stateStep !== undefined) {
    const legacyResolved = LEGACY_STEP_ALIASES[stateStep] ?? stateStep;
    if (legacyResolved !== stateStep) {
      logInfo(`Mapping state.step "${stateStep}" → "${legacyResolved}" (legacy alias)`);
    }
    const resolvedStateStep = mapMemberToCoordinator(legacyResolved, reviewers);
    if (resolvedStateStep !== legacyResolved) {
      logInfo(`Mapping state.step "${legacyResolved}" → "${resolvedStateStep}" (member → coordinator)`);
    }
    if (allowed.has(resolvedStateStep)) {
      return toStepName(resolvedStateStep);
    }
  }
  ```
  `allowed.has()` ガードは維持する（alias 解決後に許可集合外の値は throw に至る）。

**Acceptance Criteria**:
- `resolveResumeStep(undefined, null, "test-materialize")` が `"implementer"` を返す
- `resolveResumeStep(undefined, null, "build-fixer")` が `"implementer"` を返す
- `resolveResumeStep(undefined, null, "design")` が引き続き `"design"` を返す（regression なし）
- `resolveResumeStep(undefined, null, undefined)` が引き続き throw する（regression なし）
- `resolveResumeStep(undefined, null, "unknown-step")` が引き続き throw する（regression なし）

---

## T-05: テストを追加・更新して受け入れ基準を固定する

対象ファイル:
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`
- `src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts`

### T-05-a: TC-018 を更新する（drift-guard）

- [ ] `describe("TC-018: PIPELINE_MAP が全 14 step を列挙し…")` ブロックを以下のように更新する:
  - `EXPECTED_STEPS` 配列に `"bite-evidence"` を追加する
  - `expect(rows.length).toBe(14)` を `expect(rows.length).toBe(15)` に変更する
  - describe の description を `"TC-018: PIPELINE_MAP が全 15 step を列挙し各 step に一行責務が付く"` に更新する
  - `it("TC-018: PIPELINE_MAP does not contain build-fixer …")` / `"test-materialize …"` は変更しない

### T-05-b: TC-029〜TC-035 を drift-guard に追加する

- [ ] ファイル末尾（TC-028 ブロックの後）に以下の describe ブロックを追加する:

**TC-029**: implementer system prompt が 4 層 authority を持つ
```
describe("TC-029: implementer system prompt が 4 層 authority 表現を含む", () => {
  it("TC-029: IMPLEMENTER_SYSTEM_PROMPT contains '依頼意図の正典（normative）'", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("依頼意図の正典（normative）");
  });
  it("TC-029: IMPLEMENTER_SYSTEM_PROMPT contains 'レビュー済みの検証契約'", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("レビュー済みの検証契約");
  });
  it("TC-029: IMPLEMENTER_SYSTEM_PROMPT contains '実装の作業計画'", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("実装の作業計画");
  });
});
```

**TC-030**: implementer system prompt に「唯一のインプット」が含まれない
```
describe("TC-030: implementer system prompt に「唯一のインプット」が含まれない", () => {
  it("TC-030: IMPLEMENTER_SYSTEM_PROMPT does not contain '唯一のインプット'", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).not.toContain("唯一のインプット");
  });
});
```

**TC-031**: implementer system prompt に commit message への test_cases_skipped 指示が含まれない
```
describe("TC-031: implementer system prompt に commit message への test_cases_skipped 指示が含まれない", () => {
  it("TC-031: IMPLEMENTER_SYSTEM_PROMPT does not contain 'commit message に `test_cases_skipped'", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).not.toContain("commit message に `test_cases_skipped");
  });
});
```

**TC-032**: implementer system prompt に completion report への test_cases_skipped 指示が含まれる
```
describe("TC-032: implementer system prompt に completion report への test_cases_skipped 指示が含まれる", () => {
  it("TC-032: IMPLEMENTER_SYSTEM_PROMPT contains '完了報告（completion report）に `test_cases_skipped'", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("完了報告（completion report）に `test_cases_skipped");
  });
});
```

**TC-033**: rules 出力に verification continuation 例外記述が含まれる
```
describe("TC-033: rules 出力に verification continuation 例外記述が含まれる", () => {
  it("TC-033: RULES_MD_CONTENT contains 'verification 失敗後の implementer 再入'", () => {
    expect(RULES_MD_CONTENT).toContain("verification 失敗後の implementer 再入");
  });
  it("TC-033: RULES_MD_CONTENT contains 'continuation'", () => {
    expect(RULES_MD_CONTENT).toContain("continuation");
  });
  it("TC-033: RULES_MD_CONTENT contains 'fresh session に fallback'", () => {
    expect(RULES_MD_CONTENT).toContain("fresh session に fallback");
  });
});
```

**TC-034**: PIPELINE_MAP に bite-evidence 行が存在する
```
describe("TC-034: PIPELINE_MAP に bite-evidence 行が存在する", () => {
  it("TC-034: PIPELINE_MAP contains 'bite-evidence'", () => {
    expect(PIPELINE_MAP).toContain("bite-evidence");
  });
  it("TC-034: PIPELINE_MAP has bite-evidence between implementer and verification", () => {
    const lines = PIPELINE_MAP.split("\n");
    const implementerIdx = lines.findIndex((l) => l.includes("| implementer "));
    const biteIdx = lines.findIndex((l) => l.includes("| bite-evidence "));
    const verificationIdx = lines.findIndex((l) => l.includes("| verification "));
    expect(biteIdx).toBeGreaterThan(implementerIdx);
    expect(verificationIdx).toBeGreaterThan(biteIdx);
  });
  it("TC-034: PIPELINE_MAP contains 'Evidence Base'", () => {
    expect(PIPELINE_MAP).toContain("Evidence Base");
  });
});
```

**TC-035**: conformance 行に normative/plan 二層記述が含まれる
```
describe("TC-035: conformance 行に request/spec = normative の二層記述が含まれる", () => {
  it("TC-035: PIPELINE_MAP conformance row contains 'normative'", () => {
    const conformanceRow = PIPELINE_MAP.split("\n").find((l) => l.includes("| conformance "));
    expect(conformanceRow).toBeDefined();
    expect(conformanceRow!).toContain("normative");
  });
  it("TC-035: PIPELINE_MAP conformance row contains 'plan'", () => {
    const conformanceRow = PIPELINE_MAP.split("\n").find((l) => l.includes("| conformance "));
    expect(conformanceRow!).toContain("plan");
  });
  it("TC-035: PIPELINE_MAP conformance row does not contain '4 成果物'", () => {
    const conformanceRow = PIPELINE_MAP.split("\n").find((l) => l.includes("| conformance "));
    expect(conformanceRow!).not.toContain("4 成果物");
  });
});
```

### T-05-c: TC-012 / TC-013 を resolve-step-test-materialize-alias.test.ts に追加する

- [ ] ファイル末尾（TC-011 describe ブロックの後）に以下を追加する:

**TC-012**: stateStep="test-materialize", resumePoint=null, from=undefined → implementer（path 4）
```
describe("TC-012: stateStep='test-materialize' resolves to implementer (path 4 — legacy alias)", () => {
  it("TC-012: resolveResumeStep(undefined, null, 'test-materialize') → 'implementer'", () => {
    const result = resolveResumeStep(undefined, null, "test-materialize");
    expect(result).toBe("implementer");
  });

  it("TC-012: does NOT throw (is resolved via alias, not treated as unknown step)", () => {
    expect(() => resolveResumeStep(undefined, null, "test-materialize")).not.toThrow();
  });
});
```

**TC-013**: stateStep="build-fixer", resumePoint=null, from=undefined → implementer（path 4）
```
describe("TC-013: stateStep='build-fixer' resolves to implementer (path 4 — legacy alias)", () => {
  it("TC-013: resolveResumeStep(undefined, null, 'build-fixer') → 'implementer'", () => {
    const result = resolveResumeStep(undefined, null, "build-fixer");
    expect(result).toBe("implementer");
  });

  it("TC-013: does NOT throw (is resolved via alias, not treated as unknown step)", () => {
    expect(() => resolveResumeStep(undefined, null, "build-fixer")).not.toThrow();
  });
});
```

**Acceptance Criteria**:
- TC-018 の `EXPECTED_STEPS` に `"bite-evidence"` が含まれ、`expect(rows.length).toBe(15)` になっている
- TC-029〜TC-035 が drift-guard ファイルに存在し、それぞれ対応する文言を検証する
- TC-012 / TC-013 が resolve-step-test-materialize-alias.test.ts に存在する
- `resolveResumeStep(undefined, null, "test-materialize")` が `"implementer"` を返すことを TC-012 が確認する
- `resolveResumeStep(undefined, null, "build-fixer")` が `"implementer"` を返すことを TC-013 が確認する
- 既存テスト（TC-001〜TC-028、TC-009〜TC-011 の resolve-step 側）は T-05 で列挙した更新対象（TC-018 の行数・EXPECTED_STEPS）を除き無改変で green

---

## 実装完了チェックリスト

すべてのタスク完了後、以下を確認する:

- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green（新規 TC 含む）
- [ ] `IMPLEMENTER_SYSTEM_PROMPT` に「唯一のインプット」が含まれないことを grep で確認
- [ ] `PIPELINE_MAP` のデータ行数が 15 であることを確認
- [ ] `resolveResumeStep(undefined, null, "test-materialize")` が `"implementer"` を返すことを確認
