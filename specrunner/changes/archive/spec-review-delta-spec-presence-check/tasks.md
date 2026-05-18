# Tasks: spec-review delta spec presence check

## Task 1: system prompt に Delta Spec Presence Check セクション追加

**File**: `src/prompts/spec-review-system.ts`

`SPEC_REVIEW_SYSTEM_PROMPT` 定数文字列内の `## Baseline Spec Consistency Check` セクション (L59) の **前** に以下のセクションを追加する:

```
## Delta Spec Presence Check

When the request type (stated in the initial message as "Request type: <type>") is `spec-change` or `new-feature`:
- The change folder MUST contain at least one delta spec file under `specs/<capability>/spec.md`
- If the `specs/` directory is empty or missing in the change folder, report a HIGH severity finding:
  - Severity: HIGH
  - Category: completeness
  - File: `specrunner/changes/<slug>/specs/`
  - Description: "Request type '<type>' requires a delta spec, but specs/ directory contains no .md files in the change folder."
  - How to Fix: "Add delta specs under specs/<capability>/spec.md before re-reviewing."
- This check is independent of the dsv (delta-spec-validation) machine check and serves as a redundant layer.

When the request type is `bug-fix`, `refactoring`, or any other type, this check does not apply — skip it.
```

### Acceptance Criteria
- [x] セクションが `## Baseline Spec Consistency Check` の前に配置されている
- [x] `spec-change` と `new-feature` の両方が条件に含まれている
- [x] HIGH severity / completeness category が明記されている
- [x] `bug-fix` / `refactoring` では skip する指示がある

## Task 2: grep test 追加

**File**: `tests/prompts/spec-review-system.test.ts`

既存テスト群の末尾に以下の describe ブロックを追加:

```typescript
// ---------------------------------------------------------------------------
// Delta Spec Presence Check — prompt keyword tests
// ---------------------------------------------------------------------------
describe("Delta Spec Presence Check: system prompt contains presence check instructions", () => {
  it("contains 'Delta Spec Presence Check' section header", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Delta Spec Presence Check");
  });

  it("mentions spec-change and new-feature as types requiring delta specs", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("spec-change");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("new-feature");
  });

  it("specifies HIGH severity for missing delta specs", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/specs\/.*directory.*empty.*missing.*HIGH/s);
  });

  it("instructs to skip check for bug-fix and refactoring types", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("bug-fix");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("refactoring");
  });

  it("mentions this check is independent of dsv", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/independent.*dsv|dsv.*independent/is);
  });
});
```

### Acceptance Criteria
- [x] 5 test cases が追加されている
- [x] `SPEC_REVIEW_SYSTEM_PROMPT` を直接 grep する形式
- [x] `bun run test tests/prompts/spec-review-system.test.ts` が green

## Task 3: spec authority 更新

**File**: `specrunner/specs/spec-review-session/spec.md`

既存 Requirement 群の末尾に以下を追加:

```markdown
### Requirement: spec-review は type=spec-change/new-feature のとき delta spec 存在を必須として check する

spec-review エージェントは、request type が `spec-change` または `new-feature` のとき、change folder の `specs/` 配下に delta spec ファイル（`.md`）が 1 件以上存在することを確認する。不在の場合は HIGH severity の finding（category: completeness）を報告する。

この check は dsv (delta-spec-validation) の機械的 check とは独立した冗長層として機能する。

#### Scenario: type=spec-change で specs/ 不在

- **GIVEN** request type が `spec-change` である
- **AND** change folder に `specs/` ディレクトリが存在しない、または `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** HIGH severity の finding（category: completeness）が報告される
- **AND** verdict は `needs-fix` となる

#### Scenario: type=bug-fix で specs/ 不在は対象外

- **GIVEN** request type が `bug-fix` である
- **AND** change folder に `specs/` ディレクトリが存在しない
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** delta spec 存在 check はスキップされ、他の観点のみでレビューが行われる

#### Scenario: type=spec-change で specs/ 1 件以上

- **GIVEN** request type が `spec-change` である
- **AND** change folder の `specs/<capability>/spec.md` に 1 件以上のファイルが存在する
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** delta spec 存在 check は通過し、他の review 観点に進む
```

### Acceptance Criteria
- [x] Requirement header が `### Requirement:` 形式
- [x] 3 Scenario (specs 不在 / bug-fix / specs 存在) が含まれている
- [x] dsv との独立性が明記されている

## Task 4: 全体検証

```bash
bun run typecheck && bun run test
```

### Acceptance Criteria
- [x] 型チェック green
- [x] 全テスト green (既存テスト regression なし + 新規テスト pass)
