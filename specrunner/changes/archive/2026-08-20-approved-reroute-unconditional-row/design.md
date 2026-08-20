# Design: approved 温存 reroute の修正

## Context

T-03 は「reviewer が approved を出したが paired fixer の予算が切れている」場合に、fixer を経由させずに同 verdict の unconditional row へ降ろす reroute 機構。

**バグの発火経路**:

1. `spec-review` → approved + routable fixable (guarded 行 `spec-review → spec-fixer` が選択される)
2. `spec-fixer` の予算が既に 2/2 消費済み → T-03 が発火
3. cleanTransition 探索: `fixerNamesForReroute = {"code-fixer", "spec-fixer", "implementer"}`
4. `spec-review → implementer` (unconditional) を候補として評価するが、`implementer ∈ fixerNamesForReroute` なので除外
5. cleanTransition = undefined → fall-through → `SPEC_REVIEW_RETRIES_EXHAUSTED` で halt

**根本原因**: `fixerNamesForReroute` は `Object.values(loopFixerPairs)` から全 fixer を集め、cleanTransition 探索の除外条件に使っている。`implementer` は `verification` の paired fixer であり、`spec-review approved → implementer` という正規の unconditional 行を誤って除外する。

T-03 が skip すべきは「今まさに予算切れした paired fixer (= budgetSkippedFixer) への寄り道」だけ。他の fixer を全局的に除外する理由はない。

## Goals / Non-Goals

**Goals**:
- cleanTransition 探索の除外条件を `budgetSkippedFixer` 単体 + `t.when === undefined` 縛りに置き換える
- spec-fixer 予算枯渇時に spec-review approved が implementer へ正常 reroute されることを再現テストで担保
- T-03 コメントを新しい機能定義に合わせて更新

**Non-Goals**:
- T-03 発火判定側 (`fixerNamesForReroute.has(nextStep)`) の変更
- `currentStep === exhaustedReviewer` ガードの変更
- fixer 入場前予算チェック (`pipeline.ts:583-589`) の変更
- `loopFixerPairs` の型レベル構造変更
- approved 以外の verdict への T-03 一般化

## Decisions

### D1: 除外条件を `t.to !== budgetSkippedFixer` + `t.when === undefined` に置き換える

**Rationale**: T-03 の機能定義は「guarded route の paired fixer が予算切れのとき、同じ verdict の unconditional row へ降りる」。cleanTransition は unconditional 行だけを拾うべきであり、`t.when === undefined` が正確な絞り。除外は skip 対象の fixer 単体 (`budgetSkippedFixer`) で十分。`fixerNamesForReroute` を探索条件に残す理由はない。

**Alternatives**:
- `fixerNamesForReroute` から `implementer` だけ外す: 構造依存の局所パッチ。pair 構造が変わるたびに再修正が必要で根本解ではない。

### D2: 新テストを既存テストファイルに追加する (TC-017)

**Rationale**: 同一の test fixture ユーティリティ群 (`makeStep`, `makeMinimalState`, `makeMinimalDeps`) と同一の観点（T-03 budget-skip reroute）を扱う。新ファイルを作るより既存ファイルへの追記が最短差分。TC-016 との混同を避けるため TC 番号を TC-017 とする。

**Alternatives**:
- 別ファイルに新テスト: ユーティリティの重複が生まれる。

### D3: `fixerNamesForReroute` の構築は発火判定のために残す

**Rationale**: 発火判定 (`:457`) は「nextStep がいずれかの fixer か」を問う正当なチェック。変更対象は cleanTransition 探索の除外条件だけ。変数を探索から消すことで意図が明確になる。

## Risks / Trade-offs

- [Risk] `t.when === undefined` は現行の `(!t.when || t.when(state))` より強い絞り。guarded でも条件が true な行を cleanTransition として拾う可能性を除去する。これは意図した仕様強化であり、既存テスト群が無改変で green のままであることで安全を確認できる。

## Open Questions

なし。
