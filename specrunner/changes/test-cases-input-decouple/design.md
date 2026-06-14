# Design: test-cases.md を soft input 化し producer 保証を明示、descriptor 入力整合の起動前 validator を足す

## Context

pipeline の `test-cases.md` には producer/consumer の不整合がある。

- **producer**: `test-case-gen`（`src/core/step/test-case-gen.ts`）が `test-cases.md` を生成する。`writes()` は `{ path: ".../test-cases.md" }` を `verify` 無効化せず宣言している。
- **consumer**: `code-review`（`src/core/step/code-review.ts`）と custom reviewer（`src/core/step/custom-reviewer.ts`）が `reads()` で `test-cases.md` を **必須 read**（`required` 既定 = true）として宣言している。`code-review` の user message では「must-scenario 照合」に使う。

`StepExecutor.validateRequiredInputs`（`src/core/step/executor.ts`）は実行前に `reads()` のうち `required !== false` の file を存在検証し、欠落で `STEP_INPUT_MISSING` を投げる。

`fast` profile（`FAST_DESCRIPTOR`、`src/core/pipeline/registry.ts`）は producer（`test-case-gen`）を含まない slim 構成だが、consumer（`code-review`）は `test-cases.md` を必須 read のまま要求する。結果、fast では producer 不在 → `code-review` の起動前検証が `STEP_INPUT_MISSING: test-cases.md` で停止する。

この穴が全レビュー層（design / spec-review / conformance / 人手 / 既存 test）をすり抜けたのは、「この descriptor で各 step の必須 read が上流で揃うか」を検算する仕組みが存在しないため。これは architecture の構造不変条件（B-1〜B-11）ではなく、**descriptor という"データ"の妥当性検証**であり、`validateReviewerDefinitions` / `validateJobState` と同類の in-loop data validator である。

### 現状コードの実測（main `44c12d9` で検証済み）

本設計の前提は、request.md の記述ではなく実コードの実測に基づく。request.md と実コードに 2 点の差分があり、いずれも実コードを正とする（D1・D2 参照）。

1. **reads の soft 化手段は `required: false`**（`verify: false` ではない）。`IoRef.required` が read の必須性を制御し、executor は `r.required !== false` で必須集合を作る。`IoRef.verify` は **writes 専用**で、`producedContractsFromWrites`（`src/core/step/output-verify.ts`）が output contract から除外するかどうかにのみ効く。read に `verify: false` を付けても必須性は変わらない。
2. **producer の出力保証は既に存在する**。汎用 output gate が全 agent step に対し `buildAllOutputContracts` → `producedContractsFromWrites`（`verify !== false` かつ `artifact !== "gitState"` の write を `produced`/policy `halt` の contract に変換）→ `validateStepOutputs`（未生成・空・未改変テンプレを violation）→ `STEP_OUTPUT_MISSING` を実行する。`test-case-gen.writes()` は `test-cases.md` を verify 有効で宣言し、A-group の `TEST_CASES_TEMPLATE`（`src/templates/step-output-templates.ts`）も配置されるため、**producer 自身が未生成を `STEP_OUTPUT_MISSING` で落とす保証は既に効いている**。`test-case-gen.ts` のコメント（"absence は downstream の code-review が検出"）は実態と乖離した stale なコメントである。

## Goals / Non-Goals

**Goals**:

- `code-review` / custom reviewer の `test-cases.md` read を soft 化し、欠落時に `STEP_INPUT_MISSING` を出さない。standard は在れば従来どおり must-scenario 照合に使い挙動不変、fast は欠落しても通る。
- producer（`test-case-gen`）が `test-cases.md` 未生成時に自身で `STEP_OUTPUT_MISSING`（相当）で落ちる保証を**回帰テストで固定**し、コメントを実態に是正する。consumer を soft 化しても standard の safety が消えないことを担保する。
- `src/core/pipeline/` に純関数の descriptor input-completeness validator を足し、`pipeline-run.prepare` で **`composeReviewerDescriptor` 後・`bootstrapJob` 前**に合成後 descriptor を検算する。violation で throw（job state を作らない）。
- 補助の静的 unit test で `PIPELINE_REGISTRY` の base descriptor 全件が input-complete であることを CI で確認する。

**Non-Goals**:

- INV-8 本体（reviewer-snapshot guard）/ #697 — 別件。本 request は fast の入力契約バグのみ扱う。
- input-completeness validator を architecture の B-invariant（`architecture/model.md` §4）へ昇格すること、CODEOWNERS の追加 — 採らない。data validity であって code structure ではない。`components.md` / `dynamic-model.md` への配置メモ（1 行）は別途・out-of-loop で扱い、本 request では in-loop validator のみ。
- fast の他の step 構成変更 / promote / fixup / magnitude envelope — 別 request。
- `test-cases.md` のフォーマット・粒度の変更 — 不変。
- `FindingResolution` union（`fixable | decision-needed`）の変更 — 不変。

## Decisions

### D1: consumer の `test-cases.md` read を `required: false`（soft）にする

`code-review` と custom reviewer の `reads()` の `test-cases.md` エントリに `required: false` を付ける。`code-review` の user message（`buildCodeReviewInitialMessage`）の must-scenario 行は「`test-cases.md` が**在れば** must-scenario 照合、無ければ code ＋ tests を通常レビュー」と条件化する。custom reviewer の user message は `test-cases.md` を参照していないため prompt 変更は不要（read の soft 化のみ）。

standard では `test-cases.md` が存在するため挙動不変（在れば使う）。fast では欠落しても `validateRequiredInputs` の必須集合から外れ、`STEP_INPUT_MISSING` にならない。

- **Rationale（why `required: false` not `verify: false`）**: read の必須性は `IoRef.required` が制御する（executor は `r.required !== false` で filter）。`verify` は writes 専用フラグで read には効かない。request.md の "verify: false（soft）" は表現上の混同であり、reads では `required: false` が正しい手段。受け入れ基準の意図（欠落時に `STEP_INPUT_MISSING` を出さない）はこれで満たす。
- **Alternatives considered**:
  - 却下 A（`reads()` を descriptor 条件付き必須にする）: consumer に pipeline 形状（fast か standard か）の知識が漏れ、単一責任を壊す。
  - 却下 C（consumer soft 化のみで producer 保証を取り戻さない）: standard で「test-case-gen 完了したのに未生成」を誰も検出しなくなる懸念。ただし本コードでは D2 のとおり producer 保証は output gate が独立に担保しており、この懸念は元から成立しない。よって C は「危険だから却下」ではなく「前提が誤り」。

### D2: producer 保証は既存 output gate で構造的に充足済み。回帰テストで固定し、stale コメントを是正する

`test-case-gen.writes()` は現状のまま（`test-cases.md` を verify 有効で宣言）維持する。これにより汎用 output gate が `produced`/`halt` contract を導出し、未生成・空・未改変テンプレを `STEP_OUTPUT_MISSING` で落とす。本 request では (a) この保証を `test-case-gen` 固有の回帰テストで固定し、(b) `test-case-gen.ts` の stale コメント（"absence は downstream の code-review が検出" 等）を「output gate が `test-cases.md` 未生成を `STEP_OUTPUT_MISSING` で検出する」へ是正する。

- **Rationale**: 「保証を producer に移す」という要件は、実コードでは既に producer 側（writes → output gate）に存在する。新たな機構を足すと既存の `produced` contract と二重になる（patchwork）。よって本 request の正しい仕事は「既にある保証を明示・固定・正書化する」こと。D1 で consumer の必須 read が外れても、この producer 保証は独立に残るため standard の safety は維持される。
- **Alternatives considered**:
  - 却下（`outputContracts()` に `produced` 相当を新規追加）: `producedContractsFromWrites` が既に同じ contract を導出しており重複。意味のない冗長化。
  - 却下（producer 保証を「無い」前提で新規実装）: 実コードと矛盾する。verify-don't-trust に従い実測を正とする。

### D3: `validateDescriptorInputCompleteness` を `src/core/pipeline/` に純関数で追加する

シグネチャ（推奨）:

```
interface DescriptorInputViolation { step: string; path: string }

function validateDescriptorInputCompleteness(
  descriptor: PipelineDescriptor,
  ambientInputs: readonly string[],
  probe: { state: JobState; deps: StepDeps },
): DescriptorInputViolation[]
```

アルゴリズム:

1. `available = new Set(ambientInputs)` を起点に、`descriptor.steps` を**上から順に**走査する。
2. 各 step について `step.reads?.(probe.state, probe.deps)` を呼び、`required !== false` かつ `artifact !== "gitState"` の file read を抽出。各 read path が `available` に含まれなければ `{ step, path }` を violation に積む。
3. 続いて `step.writes?.(probe.state, probe.deps)` の `artifact !== "gitState"` の write path（`verify` フラグに関わらず）を `available` に加える。`verify: false` の write も file 自体は生成されるため downstream の供給源になる。
4. path 比較時に **iteration suffix を正規化**する（例: `-\d+(\.md)?$` を固定トークンへ）。これにより reviewer→fixer の loop-back 必須 read（例 `spec-fixer` の `spec-review-result-NNN.md`、`code-fixer` の `review-feedback-NNN.md`）が、上流 reviewer の write と一致する。`test-cases.md` のような suffix 無しの構造ファイルは正規化対象外で不変。
5. violations を返す（純粋。throw は呼び出し側 = D4）。

`probe.state` は **empty 相当**（`steps: {}`）を渡す。これにより `code-fixer` / `spec-fixer` / `implementer` の conformance-triggered な backward read（`getConformanceFixContext` が非 null の経路）は選ばれず、forward edge の normal-entry read が選ばれる。`probe.deps` は固定 slug ＋ 最小 `request`（`adr` を含む）を持つ最小 `StepContext`。reads/writes は `deps.slug`（path 解決）と `deps.request.adr`（`adr-gen.writes`）しか参照しないため、固定 slug でも cross-step の path 突合は成立する（同一 slug で resolve するため `design.md` の write と `spec-review` の read が一致）。

- **Rationale**: 「上流 writes ∪ ambient で必須 read が満たされるか」は data-flow reachability の最小形。empty 代表 state は forward edge を選ぶので健全。iteration 正規化は loop-back を取りこぼさないために必要。gitState（branch / worktree）は起動時に常在するため検査対象外（skip）。`fs`/`child_process` を import しない（B-5）。
- **Alternatives considered**:
  - 却下（B-invariant 化）: input-completeness は descriptor という data の妥当性であり、コードの構造ルール（B-1〜B-11 ＋ DSM）とは層が違う。`validateReviewerDefinitions` / `validateJobState` と同類。`model.md` §4 昇格・CODEOWNERS は不要。
  - 却下（iteration 正規化せず exact path 比較）: empty state では reviewer の write（`...-001`）と fixer の read（`...-000`）の iteration が不一致になり、loop-back 必須 read が偽陽性になる。

### D4: 配線は `pipeline-run.prepare`、`composeReviewerDescriptor` 後・`bootstrapJob` 前

`PipelineRunCommand.prepare`（`src/core/command/pipeline-run.ts`）で、reviewer snapshot 解決と `getPipelineDescriptor` の後・`bootstrapJob` の前（`validateReviewerDefinitions` / `assertRuntimeSupportsScope` と同じ着手前スロット）に、`composeReviewerDescriptor(descriptor, reviewers)` で**合成した実 descriptor**を作り、`validateDescriptorInputCompleteness` を実行する。`ambientInputs` には change folder に常在する `requestMdPath(slug)` を渡す（必要なら `rules.md` 等も加える。現状 declared read は `request.md` のみ）。violation があれば、その内容（step + path 一覧）を含むエラーで **throw**（`bootstrapJob` を呼ばないため job state を作らない）。

- **Rationale（why 合成後・着手前）**: 実行される descriptor は `composeReviewerDescriptor` で runtime 合成され、custom reviewer も `test-cases.md` を読む。静的 registry テスト（D5）だけでは合成後を見られないため、**authoritative な検算は合成後を見る runtime preflight**。着手前に置くことで violation 時に state を汚さない（`validateReviewerDefinitions` と同じ設計）。
- **Alternatives considered**:
  - 却下（`buildPipelineForJob` / `runPipeline` 内で検査）: そこは既に bootstrap 済み。state を作る前に止める要件を満たさない。
  - 却下（静的テストのみ）: 合成後 descriptor を検算できない。

### D5: 補助の静的 unit test（base descriptor 全件）

`PIPELINE_REGISTRY` の各 base descriptor（standard / design-only / fast）を `validateDescriptorInputCompleteness` に通し、D1 適用後に全件 input-complete（violation 0）であることを CI で確認する。authoring ミス（producer を消したのに consumer の必須 read を残す等）を merge 前に拾う安い網。

- **Rationale**: runtime preflight（D4）は実行時にしか走らない。静的テストは base の早期検出を担う補助で、D4 の代替ではなく補完。

## Risks / Trade-offs

- [Risk] iteration 正規化が過剰一般化し、本来別物の path を同一視して real violation を mask する → Mitigation: 正規化は**末尾の iteration suffix のみ**（`-\d+` 直前 + `.md`）に限定し、`test-cases.md` 等 suffix 無しの構造ファイルは不変に保つ。テストで「producer を外した fixture が test-cases.md を violation として返す」ことを明示的に確認する。
- [Risk] 代表 state/deps の構築で最小 `JobState` を作る際の型安全性 → Mitigation: 最小 state は 1 箇所（validator もしくはその helper）でコメント付きに生成。reads/writes が参照するフィールド（`steps`、`branch`）のみを満たせばよい。
- [Risk] 合成 descriptor で `code-fixer` の active reviewer 解決が representative state に依存 → Mitigation: empty 代表 state は chain を `["code-review"]` に解決し forward edge（`review-feedback`）を選ぶ。custom reviewer の result file が未読でも violation にはならない（unconsumed write は許容）。
- [Trade-off] producer 保証に新規コードを足さない（D2）。「明示的な仕組みを足した」感は薄いが、重複を避け単一責任を保つ。保証の存在はテストとコメントで可視化する。

## Open Questions

- `ambientInputs` の確定集合: 現状 declared read は `request.md` のみ。`rules.md` 等を将来 declared read にする場合は ambient 拡張が必要。本 request では `request.md` を必須 ambient とし、`rules.md` の追加は実装者裁量（害は無い）。
- validator の violation 時エラー表現: 専用 error class（`validateReviewerDefinitions` の `ReviewerValidationError` 流儀）か、`SpecRunnerError` ＋ 新規 error code か。実装者裁量。違反 step と path を列挙できれば足りる。
