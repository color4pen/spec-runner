# producer/consumer I/O 責任の分離と descriptor input-completeness 起動前検算

**Date**: 2026-06-15
**Status**: accepted
**Related**:
- `specrunner/adr/2026-06-04-step-io-contracts.md`（reads/writes 契約・STEP_INPUT_MISSING の基盤）
- `specrunner/adr/2026-06-14-fast-pipeline-profile.md`（fast pipeline の導入・本 ADR の trigger）

## Context

`fast` pipeline の初回 dogfood（job `d4b3325d`）が `code-review` step で `STEP_INPUT_MISSING: test-cases.md` で停止した。

根本原因は **producer/consumer 間の I/O 責任の転嫁**:

- `test-case-gen` が `test-cases.md` を生成する producer だが、`test-case-gen.ts` のコメントは「absence は downstream の `code-review` が検出」と明記していた。
- `code-review` / `custom-reviewer` が `test-cases.md` を**必須 read**（`required` 既定 = true）として宣言し、欠落を `STEP_INPUT_MISSING` で止める仕組みを「producer のサボり検出」の proxy として転用していた。
- `fast` は `test-case-gen` を持たない slim 構成であるため、consumer の必須 read が発火し pipeline が停止した。

この問題が全レビュー層（design / spec-review / conformance / 人手 / 既存テスト）をすり抜けた理由は、**「この descriptor で各 step の必須 read が上流で揃うか」を検算する仕組みが存在しなかった**からである。

### 実コードの実測（main `44c12d9` 時点）

- `step-io-contracts`（`2026-06-04`）が導入した output gate（`producedContractsFromWrites` → `validateStepOutputs`）は、`test-case-gen.writes()` の `test-cases.md`（verify 有効）を `produced`/`halt` contract に変換し、**producer 自身が未生成を `STEP_OUTPUT_MISSING` で落とす保証を既に持っていた**。`test-case-gen.ts` のコメントは実態と乖離した stale な記述だった。
- つまり「consumer の必須 read を外すと standard で producer のサボりを誰も検出しなくなる」という懸念は、実コードでは元から成立しない。

## Decision

### D1: consumer の `test-cases.md` read を `required: false`（soft）にする

`code-review` と `custom-reviewer` の `reads()` の `test-cases.md` エントリに `required: false` を付ける。`code-review` の user message は「`test-cases.md` が**在れば** must-scenario 照合、無ければ code ＋ tests を通常レビュー」と条件化する。

- standard では `test-cases.md` が存在するため挙動不変（在れば使う）。
- fast では `validateRequiredInputs` の必須集合から外れ、欠落しても `STEP_INPUT_MISSING` にならない。

**reads の soft 化は `required: false`（`verify: false` ではない）**: read の必須性は `IoRef.required` が制御する（executor は `r.required !== false` でフィルタ）。`verify` は writes 専用フラグであり read には効かない。

### D2: producer 保証は既存 output gate で充足済み。回帰テストで固定し、stale コメントを是正する

`test-case-gen.writes()` は現状のまま（`test-cases.md` を verify 有効で宣言）維持する。汎用 output gate が `produced`/`halt` contract を導出し、未生成・空・未改変テンプレを `STEP_OUTPUT_MISSING` で落とす。

本変更の仕事は:
- この保証を `test-case-gen` 固有の回帰テストで**固定**する。
- `test-case-gen.ts` の stale コメントを「output gate が `test-cases.md` 未生成を `STEP_OUTPUT_MISSING` で検出する」という実態に是正する。

D1 で consumer の必須 read が外れても、この producer 保証は独立して残るため standard の safety は維持される。

### D3: `validateDescriptorInputCompleteness` を in-loop data validator として追加する

`src/core/pipeline/` に純関数 validator を追加する。

```typescript
interface DescriptorInputViolation { step: string; path: string }

function validateDescriptorInputCompleteness(
  descriptor: PipelineDescriptor,
  ambientInputs: readonly string[],
  probe: { state: JobState; deps: StepDeps },
): DescriptorInputViolation[]
```

アルゴリズム:

1. `available = new Set(ambientInputs)` を起点に、`descriptor.steps` を**上から順に**走査する。
2. 各 step について `required !== false` かつ `artifact !== "gitState"` の read path が `available` に含まれなければ violation に積む。
3. 各 step の write path（`verify` フラグに関わらず）を `available` に加える。
4. **iteration suffix を正規化**する（末尾の `-\d+` ＋ `.md`）。これにより fixer の loop-back read（例 `review-feedback-NNN.md`）が上流 reviewer の write と一致する。
5. violations を返す（純粋。throw は呼び出し側）。

`probe.state` は **empty 相当**（`steps: {}`）を渡す。forward edge の normal-entry read が選ばれ、backward read（conformance-triggered な直し）は選ばれない。

**この validator は `validateReviewerDefinitions` / `validateJobState` と同類の in-loop data validator であり、architecture の B-invariant（B-1〜B-11）ではない。** `architecture/model.md` への B-x 昇格・CODEOWNERS は不要。

### D4: 配線は `pipeline-run.prepare`、`composeReviewerDescriptor` 後・`bootstrapJob` 前

`PipelineRunCommand.prepare` で、`composeReviewerDescriptor` で**合成した実 descriptor**（custom reviewer を含む）に対し、`bootstrapJob` の前（`validateReviewerDefinitions` と同じ着手前スロット）に実行する。violation があれば throw し、job state を作らない。

`ambientInputs` には change folder に常在する `requestMdPath(slug)` を渡す。

**合成後 descriptor を見る理由**: `custom-reviewer` も `test-cases.md` を必須 read として宣言しうる。静的 registry テスト（D5）だけでは合成後を見られないため、**authoritative な検算は合成後を見る runtime preflight**。

### D5: 補助の静的 unit test（base descriptor 全件）

`PIPELINE_REGISTRY` の各 base descriptor を `validateDescriptorInputCompleteness` に通し、D1 適用後に全件 input-complete（violation 0）であることを CI で確認する。runtime preflight の補助として、authoring ミスを merge 前に拾う安い網。

## Alternatives Considered

### Alternative 1: reads を descriptor 条件付き必須にする（消費側に pipeline 形状の知識を持たせる）

- **Pros**: consumer が pipeline 形状を知ることで条件分岐でき、既存の `required` フラグ機構の変更が最小になる。
- **Cons**: consumer に「fast か standard か」の知識が漏れ、単一責任を壊す。fast 以外の新 profile が追加されるたびに consumer を修正する必要が生じる。step と descriptor が密結合する。
- **Why not**: 却下（D1）。各 step は自分の I/O 契約のみを知るべきであり、pipeline 形状の知識を consumer に持たせることは設計原則に反する。

### Alternative 2: consumer soft 化のみ・producer 保証の新規追加を省く

- **Pros**: D1 だけで fast の `STEP_INPUT_MISSING` を解消できる。新規コードが少ない。
- **Cons**: 当初の懸念は「standard で test-case-gen 完了したのに未生成を誰も検出しなくなる」だった。ただし実コードの実測で無効化された——output gate（`producedContractsFromWrites`）が独立に `STEP_OUTPUT_MISSING` を保護しているため、この懸念は元から成立しない。
- **Why not**: 「危険だから却下」ではなく「前提が誤り」。実装では consumer soft 化に加えて producer 保証の是正（回帰テスト固定 + stale コメント訂正）を D2 として行うが、新規の保証機構は追加しない（D2）。

### Alternative 3: `test-case-gen.outputContracts()` に `produced` 相当を新規追加する

- **Pros**: producer の保証を明示的なコードで可視化できる。
- **Cons**: `producedContractsFromWrites` が `writes()` の宣言から既に同じ `produced`/`halt` contract を導出しており、新規追加は完全な重複になる。意味のない冗長化であり、2 箇所のメンテナンス負担が生じる。
- **Why not**: 却下（D2）。既存の output gate が構造的に充足しているため、新規機構は不要。実コードを正として回帰テストで固定するのが正しい仕事。

### Alternative 4: validator を architecture の B-invariant（model.md §4）に昇格する

- **Pros**: 機械強制されるため将来の退行に強い。CODEOWNERS で変更を保護できる。
- **Cons**: input-completeness は **descriptor という data の妥当性**であり、コードの構造ルール（B-1〜B-11 ＋ DSM）とは層が違う。`validateJobState` / `validateReviewerDefinitions` と同類。`architecture/model.md` 編集・CODEOWNERS 追加の維持コストに見合わない。
- **Why not**: 却下（D3）。pipeline component 内の data validator ＋ test で完結する。in-loop preflight として配線すれば機能上は同等の保証が得られる。

### Alternative 5: iteration suffix の正規化をせず exact path で比較する

- **Pros**: 実装がシンプルになる。過剰一般化のリスクがない。
- **Cons**: empty 代表 state では `latestIteration` = 0 となり、fixer の read path（例 `review-feedback-000.md`）と reviewer の write path（例 `review-feedback-001.md`）の iteration が不一致になる。loop-back の必須 read が偽陽性（false violation）として報告される。
- **Why not**: 却下（D3）。loop-back を正しく扱うには iteration suffix の正規化が必要。正規化は末尾 suffix のみ（`-\d+` ＋ `.md`）に限定し、`test-cases.md` 等の suffix 無し構造ファイルは不変に保つことで過剰一般化を防ぐ。

### Alternative 6: validator を `buildPipelineForJob` または `runPipeline` 内に配線する

- **Pros**: 実行コンテキストが完全に揃った後で検算できる。
- **Cons**: `buildPipelineForJob` / `runPipeline` のスロットは既に `bootstrapJob` 済み（job state 作成後）。「violation 時に job state を作らずに止める」という要件を満たさない。
- **Why not**: 却下（D4）。着手前 preflight（`validateReviewerDefinitions` と同じスロット）に置くことで、violation 時に state を汚さないという設計を維持する。

### Alternative 7: 静的 unit test のみで検算し、runtime preflight を省く

- **Pros**: 実装コストが下がる。CI で早期検出できる。
- **Cons**: 静的テストは `PIPELINE_REGISTRY` の base descriptor のみを見る。`composeReviewerDescriptor` で合成した実 descriptor（custom reviewer を含む）の completeness は実行時にしか検算できない。今回の障害は base descriptor 単体では問題が顕在化しない custom reviewer の組み合わせで起きうる。
- **Why not**: 却下（D4）。静的テスト（D5）は補助として残すが、authoritative な検算は合成後を見る D4 の runtime preflight が担う。

## Consequences

### Positive

- `fast` pipeline が `STEP_INPUT_MISSING: test-cases.md` で停止しなくなる。
- **producer/consumer 責任の原則が明確化される**: 各 step は自分の I/O 契約を持つ。producer は自身の output を保証し（writes/output gate）、consumer は自分が本当に依存するものだけを required read とする。
- **descriptor data-flow completeness の早期検出**: 今後 producer を除いた新 profile を追加しても、起動前に violation として検出できる（`fast` と同様のバグを防ぐ）。
- `PIPELINE_REGISTRY` の全 base descriptor が CI で input-complete であることが保証される。
- `standard` / `design-only` の挙動・reviewer activation・transitions は完全に無変更（additive）。

### Negative / Known Debt

- `validateDescriptorInputCompleteness` は代表 state（empty）を使うため、state-dependent な read（conformance-triggered backward read 等）は検査対象外。より精密な completeness 検証は将来の課題。
- `ambientInputs` の集合は現状 `request.md` のみ。`rules.md` 等を将来 declared read にする場合は ambient 拡張が必要になる。
- iteration 正規化は末尾 suffix に限定しているが、正規化ルール自体の更新漏れが偽陰性（real violation の mask）を生む可能性がある。テストで regression を固定する。

## References

- Request: `specrunner/changes/test-cases-input-decouple/request.md`
- Design: `specrunner/changes/test-cases-input-decouple/design.md`
- Spec: `specrunner/changes/test-cases-input-decouple/spec.md`
- Implementation: `src/core/pipeline/descriptor-input-completeness.ts`・`src/core/command/pipeline-run.ts`・`src/core/step/code-review.ts`・`src/core/step/custom-reviewer.ts`・`src/core/step/test-case-gen.ts`
