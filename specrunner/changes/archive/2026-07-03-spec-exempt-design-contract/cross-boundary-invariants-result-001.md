# Cross-Boundary Invariants Review — spec-exempt-design-contract

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **iteration**: 1

## Summary

不変条件の侵害はなし。免除は contract 構築層（単一箇所）で適用されており、local / managed runtime の検証コードは一切変更されていない。下流ステップが `spec.md` を `required=true` で読む点も、chore では `SPEC_EXEMPT_NOTE` が事前配置されているため pre-validation を通過する。既存機構との相互作用に起因する欠陥は見つからなかった。

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | LOW | prompt-guidance | `src/core/step/design.ts:65-75` — `followUpPrompt` | フォローアッププロンプトは型非依存。chore では agent が spec.md を作成しておらず「spec.md を作成した場合は」条件は非該当だが、agent が誤解して spec.md を読み「Requirements がない＝違反」と解釈すると `SPEC_EXEMPT_NOTE` を上書きする可能性がある。ただし contract gate は `verify:false` で spec.md を除外済みのため halt は発生しない。下流も `SPEC_EXEMPT_MARKER` 認識ガイダンス有りのため findings 捏造も防がれる | フォローアップを `getFollowUpPrompt(state, deps)` で型分岐させ、chore では spec.md チェックをスキップするよう将来対応可能。現時点では blocking ではない |
| 2 | LOW | prompt-guidance | `src/prompts/test-case-gen-system.ts` | `SPEC_EXEMPT_MARKER` 認識ガイダンスなし。chore では spec.md = `SPEC_EXEMPT_NOTE`（Scenario ゼロ）が存在するため "spec absent → fall back" 条件が発火しない。Scenario ゼロでは spec 由来の test case がゼロになり、自然に design.md/tasks.md から導出される | 品質的には問題ないが、明示的なマーカー認識を追加することで agent の迷いを減らせる。非ブロッキング |
| 3 | LOW | design-clarity | `src/prompts/design-system.ts:77` — Artifact Checklist | 「条件付き artifact — spec.md（spec-change / new-feature type の場合のみ）」と記載されているが、chore でも CLI が spec.md を事前配置する。Completion Checklist 側は chore の扱いを正しく記述しており矛盾ではないが、Artifact Checklist の文言が事前配置の存在を示していない | Artifact Checklist に「chore は CLI が免除ノートを事前配置済み（agent が作成する必要なし）」を一行追加すると読みやすくなる。非ブロッキング |

## Checked Invariants

### 1. Contract 構築 → runtime 検証チェーン（PASS）

`producedContractsFromWrites`（`src/core/step/output-verify.ts:72`）は `w.verify === false` の write を除外する既存ロジックが確認済み。chore では `isSpecRequired("chore") === false` → `verify: false` → spec.md の produced contract が生成されない。local / managed 双方が受け取る contract リストから spec.md が消えるため、どちらのランタイムも spec.md の validation を実行しない。runtime コードの変更は皆無で、既存の単一ロジックが正しく機能する。

### 2. spec-review.reads() が spec.md を required=true で宣言（PASS）

chore の design 前に `getOutputTemplates("design", ...)` が `SPEC_EXEMPT_NOTE` を spec.md の content として事前配置する。design agent は spec.md を編集しない指示を受けており（Completion Checklist）、spec-review 実行時に spec.md = SPEC_EXEMPT_NOTE が存在する。executor の `validateStepInputs` は「ファイルが存在する」を検証するだけであり、content には依存しない。pre-validation は通過する。

### 3. conformance / implementer / adr-gen が spec.md を required=true で読む（PASS）

同上。spec.md = SPEC_EXEMPT_NOTE が存在するため pre-validation を通過する。各 agent は `SPEC_EXEMPT_MARKER` ガイダンス（conformance）またはゼロ Scenario から自然に fallback（adr-gen / implementer）するため、エラーや findings 捏造は発生しない。

### 4. spec-fixer.writes() に verify:false なし（PASS with note）

`spec-fixer.writes()` は spec.md を `verify: true`（デフォルト）で宣言している。ただし `getOutputTemplates("spec-fixer", ...)` は `[]` を返す（scaffold なし）。violation 判定は「欠落 or 空」のみ。`SPEC_EXEMPT_NOTE` は非空のため passes。さらに chore では spec-review が `SPEC_EXEMPT_MARKER` 認識で `approved` を返すため spec-fixer は起動しない（遷移テーブル上の経路がない）。もし spec-review が異常系で `needs-fix` を返した場合でも、spec-fixer の produced contract は spec.md の「空/欠落」のみで halt する設計であり、`SPEC_EXEMPT_NOTE` は安全に通過する。

### 5. getOutputTemplates（state.request.type）と writes()（deps.request.type）の型ソース一致（PASS）

`buildAllOutputContracts` 内で `getOutputTemplates` が `state`、`writes()` が `deps` を参照する。executor は `deps` を `state` から構築するため `state.request.type === deps.request.type` は常に成立する。仮に不一致が生じた場合でも、chore の spec.md は `verify:false` で contract から除外されるため scaffold の不一致が実害を及ぼす経路はない。

### 6. SPEC_EXEMPT_NOTE が SPEC_TEMPLATE と一致しないこと（PASS）

content が異なるため scaffold equality check が誤発火することはない。`SPEC_TEMPLATE` = `## Requirements\n\n` を末尾に持つ形式。`SPEC_EXEMPT_NOTE` は `SPEC-EXEMPT` マーカーを含む別構造。テストで両者が異なることを固定済み。

### 7. local / managed runtime が同一の contract リストを消費すること（PASS）

`buildAllOutputContracts` は pure function であり local / managed 双方が同じ関数を呼ぶ。チェーン: `writes()` の `verify:false` → `producedContractsFromWrites` が除外 → 両ランタイムに渡る contract リストから spec.md が消える。T-04 テストが managed runtime 側を実際に実行して violations=0 を確認済み。local runtime 側は "contract リストに spec.md が無ければ validateStepOutputs は spec.md を読まない" という自明な論理的等価性で証明（injectable seam テスト不要）。

### 8. 未知型の fail-closed 維持（PASS）

`isSpecRequired(unknown) === true`（`TYPE_CONFIG[type]?.specRequired ?? true`）。spec-required 型と同じ contract が構築され、scaffold 一致で halt する既存挙動が維持される。テストで `"unknown"` と `""` の両ケースを固定済み。
