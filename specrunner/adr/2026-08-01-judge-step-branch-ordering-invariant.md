# ADR-20260801: judge 系 step は branch 確定後にのみ到達する — pipeline 順序不変条件

**Date**: 2026-08-01
**Status**: accepted

Related: [ADR-20260801-missing-file-finding-declaration](2026-08-01-missing-file-finding-declaration.md)

## Context

`verifyFindingRefs` seam の managed 実装（`src/core/runtime/managed.ts`）は、`branch === null`
のとき引数で受け取った全 ref を非実在として返す（全量を nonExistent 扱い）。これは managed runtime が
「branch が確定していなければ ref の存在を確認できない」という前提による設計である。

[ADR-20260801-missing-file-finding-declaration](2026-08-01-missing-file-finding-declaration.md) が
導入した split-and-invert ref 検証では、欠落宣言群の override 条件は「seam が返す nonExistent 集合に
含まれない file = 実在してしまっている = 虚偽宣言」である。managed runtime で `branch === null` の
とき seam は全 ref を nonExistent として返すため、欠落宣言群の **全 file** が nonExistent 集合に含まれ
→「含まれない file が存在しない = 虚偽宣言ゼロ = override なし」となる。

すなわち `branch = null` のとき欠落宣言群の ref 検証は**常に override しない**（= routing を保つ）。
これは「存在確認が不能なのに宣言が正しいとみなす」fail-open に見える。

この fail-open が実行時に問題を起こさない根拠として、**pipeline 順序不変条件**が存在する:
judge 系 step は pipeline descriptor の遷移テーブルにより、必ず `state.branch` が確定した後に
到達するように構成されている。したがって ref 検証が走る時点で `branch === null` になる経路は
実行時に存在しない。

## 不変条件の詳細

### pipeline の段階構造

SpecRunner の pipeline は次の順序で進行する:

1. **request-review step**: operator が PR 設計を承認し、branch 名を確定する。
2. **design step**: `state.branch` に確定した branch が設定される。
3. **judge 系 step**（regression-gate / spec-review / custom-reviewer / code-review / conformance /
   request-review ＋ フィードバックループ内の任意 step）: `state.branch` 確定済みの状態で到達する。

`verifyFindingRefs` による ref 検証が走るのは、step-completion が judge 系 step（
`collectVerdictAffectingFindings` の結果が非空のとき）のみ（`src/core/step/step-completion.ts:238`
のゲート）。これらの step は pipeline descriptor の遷移テーブル構造上、design step 完了（= branch 確定）
より前に到達する経路を持たない。

### 不変条件の形式

```
∀ judge 系 step の実行時: state.branch ≠ null
```

この不変条件は **コード（型 / assertion）ではなく pipeline descriptor の遷移順序**によって成立する
構造的制約である。型システムは `state.branch` が `string | null` であり、型レベルでは null を許容する。

## Decision

### D1: 不変条件を ADR として明文化し、pipeline 変更レビューの参照義務とする

コード上の assertion や型制約として強制することは Non-Goal（seam シグネチャ変更を行わない
ADR-20260801-missing-file-finding-declaration の方針と整合）。代わりに:

- 不変条件の根拠・影響・破れ条件をこの ADR として記録する。
- pipeline descriptor の遷移テーブルを変更する PR レビューでは、この ADR への参照確認を行う。

**採用理由**: 不変条件をコードで強制するには seam シグネチャ変更（`branch` を引数で渡す等）または
pipeline descriptor の static 解析が必要であり、いずれも Non-Goal の範囲を超える。現在のコードベースで
は pipeline 段階構造が十分に安定しており、ADR 文書化が実用的な範囲で安全を担保できる。

### D2: 非宣言群の `branch = null` 挙動（全 override）は変更しない

managed runtime で `branch = null` のとき、非宣言群の全 ref が nonExistent → 全 ref が override →
escalation になる（fail-closed）。これは従来通りであり、本 ADR の変更対象外。split-and-invert 導入後も
非宣言群の fail-closed 挙動は不変に保たれる。

### D3: 欠落宣言群の `branch = null` fail-open は pipeline 順序不変条件で封じる

欠落宣言群で `branch = null` → seam が全件 nonExistent → 虚偽宣言なし → override なし（routing 保持）
というパスは、D1 の不変条件（judge 系 step は branch 確定後にのみ到達）により実行時には発生しない。

将来 pipeline descriptor に「branch 確定前の judge 系 step 遷移」が追加されれば不変条件が破れる。
その場合は欠落宣言群の検証が fail-open になることを認識した上で、seam の branch-null 挙動変更または
step-completion での `branch === null` ガードを設計に含める必要がある。

## Alternatives Considered

### A1: seam シグネチャ変更で branch を引数に取り、null 時に明示的エラーを返す

`verifyFindingRefs` に `branch: string | null` を渡し、null 時は検証不能エラーを返す変更。

- **Pros**: コードレベルで null 経路を明示的に処理できる。型による強制が効く。
- **Cons**: seam の意味論・シグネチャ変更は Non-Goal（ADR-20260801-missing-file-finding-declaration D3）。
  local / managed 両実装の変更が必要になり、既存テストへの影響が生じる。
- **Why not**: 採用しない。pipeline 順序不変条件により実行時に問題は発生せず、シグネチャ変更は
  コストに対してベネフィットが小さい。

### A2: step-completion で `branch === null` を事前ガードして escalation に倒す

ref 検証実行前に `state.branch === null` を検出し、欠落宣言群を含む場合は escalation に強制する。

- **Pros**: fail-open を step-completion 側でコード的に封じられる。
- **Cons**: 実運用上到達しない経路のための防御コードを追加する。
  `state.branch === null` での judge 系 step 到達は pipeline の構造バグであり、隠れた失敗を
  誤った escalation で上書きする形になる。エラーを fail-visible にすることが適切。
- **Why not**: 採用しない。到達しない経路にガードを足すより、到達した場合のシグナル（`branch = null`
  なのに judge 系 step が走っている = pipeline バグ）を obscure しない方が良い。

### A3: pipeline descriptor の static 解析で不変条件を型制約にする

コンパイル時に「judge 系 step の遷移元が必ず branch 確定 step である」を型で保証する。

- **Pros**: 型レベルでの保証により、pipeline 変更時の違反をビルド時に検出できる。
- **Cons**: pipeline descriptor の大規模リファクタが必要。現在の遷移テーブル（object literal ベース）を
  型パラメータ付き構造に変える工事量は本 change のスコープを大幅に超える。
- **Why not**: 採用しない。コスト対ベネフィットが釣り合わない。ADR による明文化で十分。

## Consequences

### Positive

- pipeline 順序不変条件が明文化され、judge 系 step に到達するための前提条件が参照可能になる。
- split-and-invert 検証（ADR-20260801-missing-file-finding-declaration）の fail-open リスクが
  文書化され、将来の pipeline 変更レビューで意識的に確認できる。

### Negative

- 不変条件はコードではなく ADR と pipeline 設計によって成立する。型・assertion による機械的強制がない。
  pipeline 変更時の確認はレビュー担当者の人的判断に依存する。

### Known Debt

- `state.branch === null` での judge 系 step 到達を検出する機械的ゲート（assertion / 監視ログ）は
  現状存在しない。この経路が実行時に観測された場合（= pipeline バグ）の検出は、seam が全件 nonExistent
  を返すことによる escalation（非宣言群）か、routing が意図通りでない（欠落宣言群）かで
  間接的に観測するしかない。
- 将来の pipeline 再設計で branch 確定タイミングが変わった場合、この ADR の前提を再検証する必要がある。

## References

- Design: `specrunner/changes/missing-file-finding-declaration/design.md` — Risks 節（branch=null の
  fail-open リスクと pipeline 順序不変条件の文書化）
- Related: [ADR-20260801-missing-file-finding-declaration](2026-08-01-missing-file-finding-declaration.md)
  — 不変条件が必要になった経緯（split-and-invert 検証の導入）
- Implementation: `src/core/runtime/managed.ts`（`branch === null` 時の全件 nonExistent 挙動）
- Implementation: `src/core/port/runtime-strategy.ts`（`verifyFindingRefs` seam 契約）
- Implementation: `src/core/step/step-completion.ts`（judge 系 step ゲート）
