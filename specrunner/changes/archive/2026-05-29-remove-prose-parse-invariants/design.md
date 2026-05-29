# Design: remove-prose-parse-invariants

## Context

R3（#472 outcome-cutover）で executor の verdict 導出が typed outcome（`toolResult.approved` / `toolResult.fixableCount`）に cutover した。以下が dead code になっている:

1. **`parseReviewVerdict`**（`src/core/parser/review-verdict.ts`）— spec-review / code-review の `parseResult` 内で呼ばれるが、executor は `reportTool` を持つ agent step に対して typed path を使うため `parseResult` 自体が実行されない。
2. **`parseFixableFindings` / `parseFindingSeverityCounts`**（`src/core/parser/review-findings.ts`）— src 使用ゼロ（R3 で `toolResult.fixableCount` に置換済み）。
3. **`parseSpecReviewVerdict`**（`src/core/step/spec-review.ts` 内ラッパー）— `parseReviewVerdict` への委譲のみ。

transition table の `when` 述語は既に `state.steps` / `toolResult` のみを参照しており、`fileContent` を読んでいない（INV-1 は現時点で green）。

golden-cases.test.ts は `parseReviewVerdict` の TC-018/021 を floor として参照しているが、parser 削除で意味を失う。代わりに R3 で確定した typed 挙動の floor が必要。

## Goals / Non-Goals

**Goals**:

- dead な prose パーサ（`review-verdict.ts` / `review-findings.ts` 内関数）とその依存テストを削除する
- golden 床を prose-parse から typed outcome に移行する（床を切らさない）
- `contract/invariants.md` の INV-1〜3 を arch test で恒久 enforce する

**Non-Goals**:

- `contract/` 配下のファイル編集（authority は out-of-scope）
- stop-on-tool / managed / codex 対応
- `parseReviewScores` / `review-scores.ts` の削除（types.ts の `ReviewScores` 型が残っており、将来 typed score 導入の余地があるため今回は触れない）

## Decisions

### D1: `review-verdict.ts` を丸ごと削除し、`parseResult` を最小実装に置換

spec-review / code-review の `parseResult` は executor から呼ばれないが、Step interface の型制約で定義が必要。verdict を content から読む代わりに `{ verdict: null, findingsPath: null, fileContent: content }` を返す no-op 実装に置換する。

**Rationale**: `parseResult` 自体を interface から消す選択肢もあるが、CliStep（verification / delta-spec-validation）は今も `parseResult` を使っており、Step union の一貫性を保つため interface は維持する。dead なのは agent step の parse path であり、実装を no-op にするだけで十分。

**Alternatives**: interface を `AgentStep` と `CliStep` で分離し agent 側から `parseResult` を除去 → 影響範囲が大きく refactoring の scope を超える。

### D2: `review-findings.ts` は `FindingSeverityCounts` interface のみ残し、関数を全削除

`FindingSeverityCounts` は `types.ts` の `ParsedStepResult.scores` で型として参照されているため、interface 定義は維持する。`parseFixableFindings` / `parseFindingSeverityCounts` の 2 関数を削除する。

**Rationale**: 型定義と実装を分離する選択肢（型を `types.ts` に移動）もあるが、R4 の scope を最小に保つため現ファイルに残す。

**Alternatives**: `FindingSeverityCounts` を `types.ts` に inline → types.ts の変更量が増え、import chain の修正が拡大する。

### D3: golden 床を typed outcome ベースに移行

削除する floor:
- `parseReviewVerdict` TC-018/021 参照（コメント）

追加する typed floor（`tests/unit/contract/golden-cases.test.ts` に追加）:
- **GC-TYPED-01**: judge `approved=true` → verdict `"approved"`
- **GC-TYPED-02**: judge `approved=false` ∧ `fixableCount=0` → verdict `"needs-fix"`（矛盾を弾く）
- **GC-TYPED-03**: null toolResult judge → verdict `"needs-fix"`（safe default）

これらは executor の `finalizeStep` を直接テストする。`parseFixableFindings` の既存 golden は parser 削除に伴い除去。

**Rationale**: 床の対象を「prose parser の入出力」から「executor の typed verdict 導出」に移すことで、R3 で確定した挙動を固定する。

### D4: arch test を `tests/unit/contract/invariants.test.ts` に新設

既存の `tests/unit/architecture/module-boundary.test.ts` と同じパターン（grep / AST-light）で、INV-1〜3 を enforce する:

- **INV-1**: `STANDARD_TRANSITIONS` の `when` 述語のソースコードに `fileContent` が含まれないことを grep で検証。
- **INV-2**: `src/core/parser/review-verdict.ts` が存在しないことをファイルシステムチェック。`src/core/` 配下に `parseReviewVerdict` という export が存在しないことを grep で検証。
- **INV-3**: executor の prose parse path（`step.parseResult` 呼び出し箇所）で、`reportTool` を持つ agent step が prose path に fall through しないことを、transition table と step 定義の整合性で検証。具体的には、全 agent step が `reportTool` を定義していることを確認する。

**Rationale**: runtime test ではなく静的検証（grep / fs.existsSync）にすることで、テスト実行コストをゼロに近づけ、false positive を排除する。module-boundary.test.ts で確立済みのパターンを踏襲。

**Alternatives**: TSC plugin / ESLint rule → 依存追加が重く、grep で十分に検証できる。

### D5: テスト削除・整理の方針

| テストファイル | 方針 |
|---|---|
| `tests/unit/parser/review-verdict.test.ts` | 丸ごと削除 |
| `tests/unit/parser/review-findings.test.ts` | 丸ごと削除 |
| `tests/spec-review-verdict.test.ts` | 丸ごと削除（`parseSpecReviewVerdict` 依存） |
| `tests/unit/step/code-review-verdict.test.ts` | parseResult の prose テスト → executor typed path は別テストでカバー済み。丸ごと削除 |
| `tests/unit/contract/golden-cases.test.ts` | prose floor 除去 + typed floor 追加（T-02 の parseFixableFindings セクション削除、TC-018/021 コメント削除、typed golden 追加） |

## Risks / Trade-offs

- [Risk] `parseResult` を no-op にすると、将来 reportTool を外した agent step で verdict が null になる → **Mitigation**: INV-3 の arch test で「全 agent step に reportTool がある」ことを enforce。外す変更は arch test が catch する。
- [Risk] `FindingSeverityCounts` interface だけ残すとファイルが型定義のみになり不自然 → **Mitigation**: 将来 typed score 対応時に自然に移動される。今回は最小変更を優先。
- [Risk] grep ベースの arch test は refactoring で壊れやすい → **Mitigation**: パターンを最小限に絞り、false positive が出たら test 自体を更新する設計（module-boundary.test.ts と同じ運用）。

## Open Questions

なし。architect 評価済みの設計判断に基づき、新たな設計選択は発生しない。
