# Design: ADR Alternatives Considered follow-prompt

## Overview

`AdrGenStep` に `followUpPrompt` を追加し、ADR 生成後に Alternatives Considered セクションの self-fix を促す。PR #362 で確立した followUpPrompt primitive の 2nd consumer。

## Design Decisions

### D1: gate 機構 — `getFollowUpPrompt` method (動的解決)

**問題**: 現行の `followUpPrompt?: string` は静的 field であり、`adr: false` の no-op パスでも同一文字列が ctx に渡る。`adr: false` で follow-prompt が発火すると「Alternatives を追記せよ」に反応して ADR を誤生成しうる。

**選択**: `AgentStep` に `getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined` optional method を追加する。executor が `getFollowUpPrompt` → 静的 `followUpPrompt` の順で解決する。

**理由**:
- `getMaxTurns` と同型のパターン（既存プラクティス踏襲）
- `shouldRunFollowUp` に ADR 固有ロジックを入れずに済む（shared 層の cohesion 維持）
- adapter 改修不要（ctx.followUpPrompt が string | undefined のまま）
- DesignStep は静的 `followUpPrompt` を維持（後方互換）

**不採用案**:
- `shouldRunFollowUp` に `requestAdr` を渡す → shared 層に ADR 固有ロジックが漏れる
- AdrGenStep に静的 `followUpPrompt` を設定して executor で adr flag guard → executor に step 固有知識が漏れる
- `followUpPrompt` の型を `string | ((state, deps) => string | undefined)` に変更 → union type は呼び出し側が型ガードを要し冗長

### D2: executor の followUpPrompt 解決ロジック

executor.ts の ctx 構築で:

```typescript
followUpPrompt: step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt,
```

- `getFollowUpPrompt` が定義 → その戻り値を使用（undefined 含む）
- `getFollowUpPrompt` が未定義 → 静的 `followUpPrompt` にフォールバック
- どちらも未定義 → undefined（shouldRunFollowUp が false を返す）

**注意**: `getFollowUpPrompt` が `undefined` を返した場合、`??` により静的 `followUpPrompt` にフォールバックする。AdrGenStep は静的 `followUpPrompt` を設定しないため、`adr: false` のとき `getFollowUpPrompt` → `undefined` → static `undefined` → follow 不発火となり安全。

### D3: follow-prompt 文面 — 修正専用、判定なし

follow-prompt は「修正」を指示し「判定」を指示しない（確認バイアス回避、DesignStep と同方針）:

```
作業完了後の self-fix pass です。

あなたが書いた ADR を読み直してください。

1. Alternatives Considered セクションを確認してください:
   - 具体的な代替案名 (### Alternative N: {Name}) が存在するか
   - 各代替案に Pros / Cons / Why not が記述されているか
   - 代替案が placeholder や TODO ではなく、実際に検討された内容であるか

2. 不足があれば、先ほど読んだ change folder artifacts (design.md, request.md, review-feedback) を根拠に追記してください。
   - 代替案は実際に検討されたもののみ記述する（架空の代替案は不要）
   - request.md の「architect 評価済みの設計判断」や「スコープ外」に不採用案の記述がある場合はそれを活用する

3. 既に十分であれば変更せず end_turn してください。
```

**key point**: 「Alternatives が存在するか判定せよ」ではなく「読み直して不足があれば追記せよ」。判定ステップを入れると agent が「あります」と誤判定して通過するリスクがある。

### D4: AdrGenStep の getFollowUpPrompt 実装

```typescript
getFollowUpPrompt(_state: JobState, deps: StepDeps): string | undefined {
  if (!deps.request.adr) return undefined;
  return ADR_FOLLOWUP_PROMPT;  // 定数文字列
}
```

- `adr: false` → `undefined` → follow 不発火（no-op パスで ADR 誤生成を防止）
- `adr: true` → prompt 返却 → shouldRunFollowUp が success && truthy で発火
- judge=no で agent が end_turn した場合も completionReason は "success" なので follow-prompt は発火するが、ADR ファイルが存在しないため agent は「ADR がないので修正不要」と判断して end_turn する（harmless extra turn）

## Affected Files

| File | Change |
|------|--------|
| `src/core/step/types.ts` | `getFollowUpPrompt?` method 追加 |
| `src/core/step/executor.ts` | followUpPrompt 解決ロジック変更（1 行） |
| `src/core/step/adr-gen.ts` | `getFollowUpPrompt` 実装 + prompt 定数 |
| `tests/unit/core/step/adr-gen.test.ts` | getFollowUpPrompt テスト追加 |
| `tests/unit/step/executor.test.ts` | getFollowUpPrompt 解決テスト追加（必要に応じて） |

## Delta Specs

- **step-execution-architecture**: `getFollowUpPrompt` method の追加 + executor 解決ロジック
- **adr-generation**: AdrGenStep の follow-prompt 要件
