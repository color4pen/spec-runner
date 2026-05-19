# Spec Review Result 003: delta-spec-auto-classification

- **verdict**: approved
- **reviewed-at**: 2026-05-19
- **reviewer**: spec-reviewer

---

## Overall Assessment

002 で指摘した全 MEDIUM 問題は対応済み。今回の全体チェックで新たな CRITICAL / HIGH / MEDIUM 問題は見つからなかった。3 件の LOW を記録するが、いずれも実装の妨げにならない。

---

## 002 指摘の対応状況

| ID | 002 重大度 | 対応状況 |
|---|---|---|
| M-01 | MEDIUM | ✅ T-15（ADR 作成）が tasks.md に追加済み |
| L-01 | LOW | 任意修正・実装影響なし（未修正で問題なし）|

---

## 新発見: LOW のみ

### L-01: `baseline header consistency check before merge application` のシナリオ文言が旧形式参照のまま

`specrunner/specs/spec-merge/spec.md`（baseline）の "baseline header consistency check before merge application" 要件に含まれるシナリオ:

```
#### Scenario: MODIFIED header not in baseline triggers early escalation
- GIVEN a delta spec with `## MODIFIED Requirements` containing `### Requirement: Foo`...

#### Scenario: ADDED duplicate detected before merge
- GIVEN a delta spec with `## ADDED Requirements` containing `### Requirement: Bar`...
```

これらのシナリオ文言は旧形式（`## MODIFIED Requirements` / `## ADDED Requirements`）を参照しているが、この delta spec（changes/specs/spec-merge/spec.md）は当該要件を `## Requirements` に含めていない。T-00 で新形式変換後も baseline のこの要件はそのまま保持される（delta spec に書かれていないため）。

**影響の評価**: `checkBaselineHeaderConsistency` は `classifyDeltaSpec` 通過後の `DeltaSpec`（`added[]` / `modified[]` / `removed[]` 配列）を受け取る。新形式では `classifyDeltaSpec` が baseline 突合で MODIFIED / ADDED を決定する設計（D2）のため、この check は defense-in-depth として引き続き有効に機能する。シナリオ文言が旧形式参照のまま残るが、関数の動作は正しい。実装への影響なし。

**対応**: 任意（ADR か別 request で将来的に更新）。

---

### L-02: `## Renamed` の `from` が baseline に存在しない場合の動作が未定義

D5 / T-02 は "renamed エントリの `from` → `to` を baseline 上で適用" と規定するが、`from` が baseline に存在しない場合の動作（no-op か error か）が仕様書（design.md / specs/spec-merge/spec.md）に明記されていない。

**影響の評価**: happy path（正しい rename 指示）には影響しない。ただし typo による不正 rename 指示が silent no-op になった場合、rename 後の要件が ADDED として分類され、意図しない重複が baseline に入る可能性がある。T-10 にこのシナリオのテストがない。

**対応**: 任意。implementer が silent no-op を選択しても動作として許容範囲だが、warning ログまたは error を検討する価値はある。

---

### L-03: `specs/delta-spec-rule/spec.md` に baseline 既存要件の no-op MODIFY が含まれる

delta spec (`specrunner/changes/delta-spec-auto-classification/specs/delta-spec-rule/spec.md`) は `## ADDED Requirements` 配下に `DeltaSpecRuleName union type` 要件を書いているが、この要件はすでに baseline（`specrunner/specs/delta-spec-rule/spec.md`）に同一内容で存在している。

T-00 で新形式変換後は `classifyDeltaSpec` が MODIFIED として分類し、内容が同一のため no-op update になる。`specrunner finish` は正常に完了する。

**影響の評価**: 実害なし。propose agent が baseline 内容をコピーした artifact と推定される。

---

## Security Review

追加所見なし。001 / 002 での評価（path construction / regex ReDoS / OWASP）に変化なし。

---

## 総括

設計思想（LLM から tool へ分類責任を移す）・decision の記録（D1〜D7）・タスク分解（T-00〜T-15）・delta spec 整合性はすべて acceptable。001/002 で指摘した全 CRITICAL / HIGH / MEDIUM 問題が解消されており、LOW 3 件は実装ブロッカーではない。

実装に進んで良い。
