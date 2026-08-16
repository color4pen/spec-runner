# Cross-Boundary Invariants Review — rules-delivery (iteration 1)

## Summary

Reviewed changes in `change/rules-delivery-86f243f2`. The implementation is functionally correct and the new `delivery: prompt` path works as designed. Two cross-boundary invariant issues were identified where the change breaks documented contracts that unchanged code relied upon.

---

## Findings

### [HIGH] `buildStepContext` 「no exceptions」ドキュメント不変条件の破損

**Files**: `src/core/step/step-context-builder.ts:5`, `src/core/step/executor.ts:312`

**What was the invariant**: 

`step-context-builder.ts` のモジュールコメント（行 5）は明示的に述べている:
> "Contains NO control-flow early returns, no exceptions, no state mutations. All paths lead to a fully constructed AgentRunContext."

`executor.ts` の呼び出しサイトコメント（行 312）も繰り返す:
> "Build agent run context — pure assembly, no control flow, no exceptions."

この不変条件は別の change で書かれた `spec-review-prior-round-context.test.ts` TC-024 のテストにも反映されており、「buildStepContext — prepareRoundContext が reject しても**例外を投げず**」と明示的に主張している。

**What the change broke**:

D6 の設計（unknown delivery 値は step 実行前に fail する）により、`splitRulesByDelivery` は不正な `delivery` 値で例外を投げる。この例外は `buildStepContext` でキャッチされずそのまま伝播する（tasks.md T-04: "catch しない"）。

機能的には `executor.ts` の外側 try/catch（`execute()` および `produceResult()`）が例外を捕捉するため、実行時挙動は意図通り（unknown delivery → halt）。しかし:

1. コメントで宣言された不変条件「no exceptions」が現在は偽になった。
2. `executor.ts` の行 312-313 はまだ "pure assembly, no control flow, no exceptions" と読めるため、ここに将来コードを追加する開発者が try/catch 不要と誤解するリスクがある。
3. TC-024 のテスト名 "buildStepContext does not throw when prepareRoundContext rejects" は、prepareRoundContext パスについては今でも正確だが、`buildStepContext` が「一切例外を投げない」という読み方もでき、誤解を招く。

**Resolution**: fixable — 両ファイルのコメントを実際の挙動に合わせて更新する。`buildStepContext` は delivery 分類エラーで throw することがある旨を明記し、executor の呼び出しサイトも "may throw for delivery config errors — caught by outer try/catch" と更新する。

---

### [MEDIUM] TC-017・TC-018（managed / codex adapter の注入位置）が automated に分類されているが実装されていない

**Files**: `specrunner/changes/rules-delivery/test-cases.md`（result セクション: automated: 22）

**What was the invariant**:

`test-cases.md` の result セクションは `automated: 22` と記録している。TC-017（managed adapter — `promptRules` を git push instruction の直前に注入する）と TC-018（codex adapter — completion directive の直前に注入する）は category: integration / priority: should として automated に含まれている。

**What the change broke**:

変更後ファイルを確認する限り、managed-agent および codex adapter には `promptRules` 注入の位置を固定するテストが存在しない。

- claude-code adapter: `src/adapter/claude-code/__tests__/prompt-rules-injection.test.ts` が TC-003・TC-005・TC-019 を実装しており位置が固定されている ✓
- managed-agent adapter: `src/adapter/managed-agent/__tests__/` 配下に `promptRules` 関連テストなし
- codex adapter: `src/adapter/codex/__tests__/` 配下に `promptRules` 関連テストなし（`resume-prompt-injection.test.ts` 等は既存のみ）

これにより「managed / codex で注入位置が変わっても無音で通過する」状態になっている。注入自体は実装されており (managed: `agent-runner.ts:630-632`、codex: `agent-runner.ts:364-366`) コードレビューで確認済みだが、機械歯がない。

**Scope note**: T-06 の受け入れ基準は "typecheck が通る" のみで、位置固定テストは要求していない。TC-017/018 は "should" 優先度で request の受け入れ基準外。ただし test-cases.md の automated カウントが実態（20件）と乖離している。

**Resolution**: fixable — managed / codex adapter のテストファイルに TC-017・TC-018 を実装するか、test-cases.md の automated カウントを 20 に修正し TC-017/018 を manual に再分類する。

---

## Observations

### `splitFrontmatter` の重複実装

**File**: `src/core/step/rules-delivery.ts`

Design D2 で明示的に認識・決定済み。`reviewers/definition.ts` の `splitFrontmatter` を再利用せず、`rules-delivery.ts` 内にコピーを保持する選択。frontmatter 規約が reviewers 側で変更された場合に rules-delivery 側が追随しないドリフトリスクが残る。技術的負債として記録する（設計上の既知トレードオフ）。

### 既存 rules ファイルとの後方互換

`specrunner/rules/` 配下で先頭が `---` で始まるファイルは `02-test-command.md`（本 change で意図的に変更）のみであることを確認。他の rule ファイル（`01-coding-rules.md`、`code-fixer/01-test-command.md`、`build-fixer/01-test-command.md`、`test-materialize/01-test-command.md`）はいずれも `---` で始まらず、frontmatter 誤判定のリスクは現時点では存在しない。

### executor の try/catch カバレッジ

`buildStepContext` の throw が `execute()` では emit + re-throw、`produceResult()` では halt に正規化されることを確認。どちらのパスも例外が適切に処理される。機能的安全性は保たれている。

---

## Evidence

- `src/core/step/step-context-builder.ts` 全体を読み、行 5 のコメントと行 94 の `splitRulesByDelivery` 呼び出し（throw なし catch）を照合
- `src/core/step/executor.ts` 行 110-320 を読み、`produce()` 内の `buildStepContext` 呼び出しと外側 try/catch（`execute()` + `produceResult()`）を確認
- `src/core/step/__tests__/spec-review-prior-round-context.test.ts` TC-024 の期待値（threw === false）を確認
- `src/adapter/managed-agent/__tests__/` および `src/adapter/codex/__tests__/` を Glob で列挙し、promptRules テストの不在を確認
- `tests/core/step/rules-delivery.test.ts` の全テストケースを読み、splitRulesByDelivery / buildRulesPromptSection の網羅を確認
- `src/adapter/claude-code/__tests__/prompt-rules-injection.test.ts` を読み、claude-code 側の位置固定が存在することを確認
- `specrunner/rules/**/*.md` の全ファイルを Glob + grep で `^---` を検索し、既存 rule files の後方互換性を確認
- `src/core/step/rules-resolve.ts` / `rules-followup-prompts.ts` / `tests/core/step/rules-resolve.test.ts` / `tests/unit/core/step/post-work-prompt-invariant.test.ts` を読み、既存テストが新 `splitRulesByDelivery` 挿入（empty array パス）で無改変 green であることを確認
