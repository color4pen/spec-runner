# Tasks: request-review-complexity-eval

## [x] Task 1: request review prompt に Step 5 を追加

**ファイル**: `src/prompts/request-review-system.ts` (変更)

`REQUEST_REVIEW_BASE` の Step 4 と `---` の間に新しい Step 5 を追加する。

追加する内容:

```
### Step 5: Complexity & Reuse Evaluation
- **Complexity risk**: Does the proposed change add unnecessary complexity to the existing architecture?
- **DRY violation**: Does the request duplicate mechanisms that already exist in the codebase?
- **Existing asset reuse**: Can existing implementations satisfy the requirements without new construction?

If you detect multiple design approaches in the request (explicit or implied):
- Do NOT list them in parallel. Instead, recommend ONE approach with rationale.
- Base your recommendation on the three perspectives above (complexity risk, DRY, existing asset reuse).
- The final decision remains with the request author — your role is to provide an informed recommendation, not to decide.

Findings from this step are capped at MEDIUM severity. Complexity and reuse concerns are advisory — they do not block pipeline execution.
```

配置位置: Step 4 の箇条書き末尾の後、`---` + `## Severity Scope Constraint` セクションの前。

**依存**: なし

---

## [x] Task 2: regression test を追加

**ファイル**: `tests/unit/command/request-review.test.ts` (変更)

以下のテストケースを追加:

### TC-RR-015: prompt に複雑化リスク評価観点が含まれる

```typescript
describe("TC-RR-015: REQUEST_REVIEW_SYSTEM_PROMPT contains complexity evaluation perspectives", () => {
  it("includes complexity risk, DRY violation, and existing asset reuse perspectives", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Complexity risk");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("DRY violation");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Existing asset reuse");
  });
});
```

### TC-RR-016: 複数アプローチ検出時の推奨提示指示が含まれる

```typescript
describe("TC-RR-016: REQUEST_REVIEW_SYSTEM_PROMPT contains multi-approach recommendation rule", () => {
  it("instructs to recommend ONE approach instead of parallel listing", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("recommend ONE approach");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Do NOT list them in parallel");
  });
});
```

### TC-RR-017: Step 5 の findings severity 上限が MEDIUM である

```typescript
describe("TC-RR-017: REQUEST_REVIEW_SYSTEM_PROMPT caps Step 5 findings at MEDIUM", () => {
  it("states MEDIUM severity cap for complexity findings", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("capped at MEDIUM severity");
  });
});
```

**注意**: 既存の TC-RR-011〜TC-RR-014 との番号衝突がないことを確認すること。

**依存**: Task 1

---

## [x] Task 3: delta spec を作成

**ファイル**: `specrunner/changes/request-review-complexity-eval/specs/request-authoring-guard/spec.md` (新規)

baseline `request-authoring-guard` spec に以下の Requirement を delta 追加:

```markdown
### Requirement: Request Review Prompt Complexity Evaluation Perspectives

`src/prompts/request-review-system.ts` の review process に、複雑化リスク評価の Step を SHALL 追加する。この Step は以下の 3 観点を含む:
- Complexity risk: 提案が既存アーキテクチャをどの程度複雑にするか
- DRY violation: 既存の類似機構との重複がないか
- Existing asset reuse: 既に実装済みの仕組みで要件を満たせないか

#### Scenario: 3 観点が prompt に存在する

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** "Complexity risk" を含む評価観点が含まれている
- **AND** "DRY violation" を含む評価観点が含まれている
- **AND** "Existing asset reuse" を含む評価観点が含まれている

### Requirement: Request Review Prompt Multi-Approach Recommendation Rule

`src/prompts/request-review-system.ts` に、複数の設計アプローチを検出した場合に推奨案 1 つを根拠付きで提示する instruction を SHALL 追加する。並列列挙を禁止し、最終判断は request 作成者に委ねる旨を明示する。

#### Scenario: 推奨提示ルールが prompt に存在する

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** 複数アプローチ検出時に推奨案 1 つを提示する instruction が含まれている
- **AND** 並列列挙を禁止する旨が含まれている
- **AND** 最終判断は request 作成者に委ねる旨が含まれている

#### Scenario: findings severity が MEDIUM に制限される

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** complexity evaluation の findings severity 上限が MEDIUM である旨が含まれている
```

**依存**: なし (Task 1 と並列可)

---

## [x] Task 4: typecheck & test green 確認

`bun run typecheck && bun run test` を実行し、全テストが green であることを確認。

**依存**: Task 1, Task 2, Task 3

---

## 実行順序

```
Task 1 (prompt 変更) ──┐
Task 3 (delta spec) ───┤
                       ├─→ Task 2 (regression test) ─→ Task 4 (green 確認)
```

Task 1 と Task 3 は並列実行可能。
Task 2 は Task 1 完了後（prompt テキストが確定してから assertion を書く）。
Task 4 は全タスク完了後。
