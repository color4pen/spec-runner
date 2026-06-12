# Spec: code 変更後の機械検証を pr-create 前に保証する

## Requirements

### Requirement: 最後のコード変更を含む状態での機械検証が pr-create 前に成功していること

pipeline は、pr-create step を実行する前に、最後にコードを変更した step の変更を内包した状態で verification step（`typecheck && test`）が `passed` で完了していることを保証 SHALL する。具体的には、`conformance` が `approved` で完了したとき、最後の verification 実行以降に impl-phase の code-mutator step（implementer / build-fixer / code-fixer）が実行されていれば、adr-gen へ進む前に verification を再実行 SHALL する。

#### Scenario: code-fixer の変更が pr-create 前に再検証される

**Given** implementer → verification(passed) の後に code-review が needs-fix を出し、code-fixer がコードを変更し、code-review が approved、conformance が approved に達した状態
**When** pipeline が `conformance approved` の遷移を解決する
**Then** 次の step は verification（再検証）であり、verification が passed で完了してから adr-gen → pr-create へ進む

#### Scenario: conformance needs-fix:code-fixer 経由の変更も再検証される

**Given** conformance が `needs-fix:code-fixer` を出し、code-fixer がコードを変更し、再度 conformance が approved に達した状態
**When** pipeline が `conformance approved` の遷移を解決する
**Then** 次の step は verification（再検証）であり、verification を経てから pr-create へ向かう

### Requirement: 再検証が failed のとき build-fixer 経路へ遷移すること

再検証として実行された verification が `failed` で完了したとき、pipeline は既存の `verification failed → build-fixer` 遷移と同じ収束則に従い build-fixer へ遷移 SHALL する。再検証のための新しい収束予算や maxIterations は導入 SHALL NOT する。

#### Scenario: 再検証 failed は build-fixer へ流れる

**Given** `conformance approved` から再検証として verification が実行され、`typecheck && test` が失敗した状態
**When** pipeline が verification の `failed` 出力の遷移を解決する
**Then** 次の step は build-fixer であり、build-fixer → verification の既存ループ（`VERIFICATION_RETRIES_EXHAUSTED` 予算）に乗る

#### Scenario: build-fixer 回復後に再検証が通過して pr-create へ向かう

**Given** 再検証 failed → build-fixer がコードを修正し、続く verification が passed で完了し、conformance の最新 verdict が approved の状態
**When** pipeline が verification の `passed` 出力の遷移を解決する
**Then** 次の step は adr-gen であり、code-review の再実行を経由しない

### Requirement: コード変更が起きていない run で再検証を追加しないこと

最後の verification 実行以降に impl-phase の code-mutator step が一度も実行されていない場合、pipeline は再検証を追加実行 SHALL NOT する。`conformance approved` は直接 adr-gen へ遷移 SHALL する。

#### Scenario: fixer が走らない clean run では verification が一度だけ走る

**Given** implementer → verification(passed) → code-review(approved, findings なし) → conformance(approved) と進み、verification 以降に implementer / build-fixer / code-fixer のいずれも実行されていない状態
**When** pipeline が `conformance approved` の遷移を解決する
**Then** 次の step は adr-gen であり、verification は再実行されない（run 全体で verification の実行回数は 1）

### Requirement: 初回 verification の遷移先が不変であること

`conformance` がまだ approved に達していない文脈（implementer 直後の初回 verification、または conformance `needs-fix:implementer` 後の再実装検証）では、verification の `passed` 出力は従来どおり code-review へ遷移 SHALL する。

#### Scenario: 初回 verification passed は code-review へ向かう

**Given** implementer → verification と進み、conformance がまだ一度も approved を出していない状態
**When** pipeline が verification の `passed` 出力の遷移を解決する
**Then** 次の step は code-review である

### Requirement: custom reviewer 構成でも保証が成立すること

custom reviewer が宣言され reviewer chain が動的に延長された構成（`composeReviewerDescriptor`）でも、上記の再検証保証が成立 SHALL する。verification / conformance の遷移行は reviewer chain の再生成によって除去 SHALL NOT される。

#### Scenario: custom reviewer 構成で再検証行が保持される

**Given** custom reviewer snapshot を含む合成済み PipelineDescriptor
**When** その transitions を検査する
**Then** `conformance approved → verification`（条件付き）と `verification passed → adr-gen`（条件付き）の遷移行が存在する
