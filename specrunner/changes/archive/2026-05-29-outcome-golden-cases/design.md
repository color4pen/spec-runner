# Design: grounded 検査の golden case を追加して contract の床を固める

## Context

`contract/` で定義された pipeline 契約（`golden-cases.md`, `invariants.md`）を消費し、grounded 検査の回帰ネットを先に敷く（contract 実装 4 段階の R1）。

現状:
- `parseFixableFindings`（`src/core/parser/review-findings.ts`）にはユニットテストが存在しない
- `VerificationStep.parseResult`（`src/core/step/verification.ts`）の `## Verdict:` 行読み取りにはユニットテストが存在しない（runner 層の `runVerification` は `tests/unit/core/verification/runner.test.ts` でカバー済み、`extractVerificationFailures` は `parse-result.test.ts` でカバー済み）
- `parseReviewVerdict` の基本ケースは `tests/unit/parser/review-verdict.test.ts`（TC-018, TC-021）が既にカバー

振る舞いの変更はゼロ。テスト追加のみ。

## Goals / Non-Goals

**Goals**:
- golden-case 専用テストファイルを 1 つ作り、`contract/golden-cases.md` 対応の床を集約する
- 未テストの grounded 検査 2 件（`parseFixableFindings`, `VerificationStep.parseResult`）に must-pass / must-fail-safe の golden case を追加する
- 既存カバー分（`parseReviewVerdict`）は参照コメントのみで複製しない

**Non-Goals**:
- 振る舞いの変更
- 既存テストファイルの改変
- `contract/` 配下の編集
- 新しい outcome 形（矛盾検査等）の golden case（R4 スコープ）

## Decisions

### D1: テストファイルの配置 — `tests/unit/contract/golden-cases.test.ts`

`contract/golden-cases.md` との 1:1 対応が discoverable になる配置。既存の `tests/unit/` 慣習に従う。

**Rationale**: 既存テストは `tests/unit/<domain>/` にドメイン名で分類されている。`contract/` は新しいドメインだが、テストが守る対象（contract 文書）と対応する名前にすることで床の所在が一目でわかる。

**Alternatives considered**:
- 各 parser のテストファイルに追記 → 床が散在し discoverable でない、既存テスト改変になる
- `tests/contract/` (unit/ の外) → 既存慣習と異なる

### D2: `parseFixableFindings` は直接 import してテスト

pure function なので mock 不要。Findings テーブルに `Fix` 列がある入力（must-pass: count > 0）と、空入力 / 該当行なし（must-fail-safe: count = 0）を assert。

**Rationale**: 関数のシグネチャは `(content: string) => number` で、副作用・外部依存なし。

**Alternatives considered**:
- integration test 経由 → 不要な複雑さ、golden case の意図が埋もれる

### D3: `VerificationStep.parseResult` は Step オブジェクトから直接呼び出し

`VerificationStep.parseResult(content, deps)` を呼ぶ。`deps` は `slug` だけ使うので最小限のスタブで済む（`StepDeps` に `as` cast）。runner の `runVerification` は mock しない（呼ばない）。

**Rationale**: `parseResult` は pure な文字列解析。`## Verdict: failed` を入力して verdict が `"failed"` になること、`## Verdict: passed` でないことを assert する。runner 層（spawn + fs）は既存テスト済みなので重複させない。

**Alternatives considered**:
- runner.test.ts に追記 → 既存テスト改変禁止（スコープ外）
- parse-result.test.ts に追記 → あれは `extractVerificationFailures` 用。`VerificationStep.parseResult` は別関数

### D4: 既存カバー分は参照コメントのみ

ファイル冒頭のドキュメントコメントで「`parseReviewVerdict` の floor は TC-018 / TC-021（`tests/unit/parser/review-verdict.test.ts`）が担保」と記載。テストは複製しない。

**Rationale**: 同一ロジックのテスト重複は保守コスト。floor の全体像を discoverable にするにはコメント参照で十分。

## Risks / Trade-offs

- [Risk] golden-case ファイルが増えすぎてメンテ不能になる → **Mitigation**: R1 では 2 検査のみに絞り、追加は contract 文書の更新と連動させる
- [Risk] `parseResult` の deps スタブが将来の型変更で壊れる → **Mitigation**: 最小限のフィールドだけ使うので影響は小さい。壊れたら型エラーで検出される

## Open Questions

なし。要件が明確で設計判断は architect 評価済み。
