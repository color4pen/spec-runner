# test-cases.md を code-review の soft input にし producer に出力保証を移す ＋ descriptor を起動前 validator で検算する（fast STEP_INPUT_MISSING 修正）

## Meta

- **type**: spec-change
- **slug**: test-cases-input-decouple
- **base-branch**: main
- **adr**: true

## 背景

fast pipeline 初回 dogfood（#697、job `d4b3325d`）が **code-review** で `STEP_INPUT_MISSING: test-cases.md` で停止した。根因は `test-cases.md` の **producer/consumer 不整合**: fast は producer（`test-case-gen`）を削った slim profile だが、consumer（`code-review` / `custom-reviewer`）がその出力を**必須入力**に要求している。

掘り下げた結論（本 request の設計前提）:
- **code-review は test-cases.md を必要としていない**（hard requirement ではない）。使うのは `code-review.ts:86` の「must-scenario 照合」1箇所だけで、code-review の核（diff の correctness/品質・書かれたテストのレビュー）は無くても動く。必須にしていたのは「test-case-gen が出力をサボった」を捕まえる safety の**転用**（`test-case-gen.ts:44`）であって、code-review 自身の依存ではない。
- 今回の穴が全レビュー層（design / spec-review / conformance / cross-boundary / 人手レビュー / 5331 test）をすり抜けたのは、**「この descriptor で各 step の必須入力が上流で揃うか」を見る検算が誰にも無い**から。これは **architecture の不変条件（B-x）ではなく、descriptor という“データ”の妥当性検証** ＝ `validateReviewerDefinitions` と同類の **in-loop validator**。
- 走らせる pipeline: **standard**（fast が壊れているため。`pipeline` 未指定＝`standard`。standard は test-case-gen が test-cases.md を産むので本 request 自身は問題なく走る）。

### 現状コードの前提（検証済み・main `44c12d9`）

- consumer: `src/core/step/code-review.ts:123` が `${changeFolder}/test-cases.md` を**必須 read**（`reads()`）にし、`:86` で must-scenario 照合に使う。`src/core/step/custom-reviewer.ts:126` も同じ必須 read を持つ。
- producer: `src/core/step/test-case-gen.ts:72` が `test-cases.md` を生成。ただし agent が直接 commit・idle 検出（`:87`）で **pipeline の output-gate で検証していない**（`:44`「absence は downstream の code-review が検出」）。＝存在保証が code-review の必須 read 一本に依存。
- `FAST_DESCRIPTOR`（`src/core/pipeline/registry.ts`）は test-case-gen を含まない（slim）。→ fast では producer 不在 → code-review で STEP_INPUT_MISSING。
- 実行される descriptor はしばしば **runtime 合成**される（`composeReviewerDescriptor` が base ＋ custom reviewers ＋ regression-gate を組む）。**custom-reviewer も test-cases.md を必須読みする**ため、検算は base だけでなく**合成後の descriptor**に効かせる必要がある。
- `Step.reads(state, deps): IoRef[]`、`IoRef.verify: false` で必須検証から除外。StepExecutor が実行前に `validateStepInputs` で必須 read の存在を検証し、欠落で `STEP_INPUT_MISSING`。`validateReviewerDefinitions`（`pipeline-run.ts`）は `bootstrapJob` の**前**で throw する「着手前 preflight」の前例。
- `PIPELINE_REGISTRY` は `standard` / `design-only` / `fast` の 3 descriptor。

## 要件

最重量: **(1) consumer を soft 化し (2) 保証を producer に移し (3) descriptor の入力整合を起動前に検算する validator を足す。**

1. **consumer を soft input に**
   - `code-review` / `custom-reviewer` の `test-cases.md` read を `verify: false`（soft）にする。プロンプトは「`test-cases.md` が**在れば** must-scenario 照合、無ければ code ＋ tests を通常レビュー」。
   - standard では `test-cases.md` が在るので**挙動不変**（在れば使う）。fast では欠落しても STEP_INPUT_MISSING にならず通る。

2. **producer に出力保証を移す（standard の safety を維持）**
   - `test-case-gen` が `test-cases.md` を生成したことを**検証付き output contract**（`writes` / `outputContracts`、verify 有効）で**自分で保証**する。「完了したのに未生成」を producer 自身が `STEP_OUTPUT_MISSING`（相当）で落とす。
   - これまで code-review の必須 read が肩代わりしていた safety を正しい場所（producer）へ移す。① だけだと standard でこの safety が消えるので、② で取り戻す。

3. **descriptor input-completeness validator（in-loop。architecture B-invariant ではない）**
   - `src/core/pipeline/` に純関数 validator を足す（例 `validateDescriptorInputCompleteness(descriptor, ambientInputs)`）。step を上から辿り、各 step の**必須 read（verify ≠ false）**が、**上流 step の writes** か **ambient 入力**（起動時に change folder に常在する `request.md` / `rules.md` 等＝project 固有の集合をパラメタで渡す）で満たされるかを検査し、満たされない物を violation として返す。`fs`/`child_process` を import しない（B-5）。
   - **着手前 preflight として配線**: `pipeline-run.prepare` で、descriptor 解決 ＋ `composeReviewerDescriptor` で**合成した実 descriptor**に対し、`bootstrapJob` の**前**に実行（`validateReviewerDefinitions` と同じスロット）。violation あれば throw（job state を作らない）。合成後を見るので custom-reviewer 込みの実 descriptor を拾える。
   - **これは `validateReviewerDefinitions` と同類の data validator**であって architecture の不変条件ではない。`architecture/model.md` への B-x 昇格・CODEOWNERS は**不要**（in-loop で完結）。
   - 補助として `PIPELINE_REGISTRY` の base descriptor を回す**静的 unit test**も足す（merge 前に authoring ミスを CI で拾う安い網）。
   - 実務注意: `reads`/`writes` は `(state, deps)` を取るので**代表 state で呼ぶ**（test-cases.md のような構造的必須入力は state に依らず安定なので拾える）。

4. **既存挙動の不変**
   - ① で test-cases.md が soft になるので、③ validator は standard / fast を含め全 descriptor で green（standard は test-case-gen が産む、fast は soft で不要）。
   - `standard` / `design-only` の挙動、reviewer activation、transitions、registry の step 構成は無改変（入力契約・検証だけ変える）。

## スコープ外

- **INV-8 本体（reviewer-snapshot guard）/ #697** — 別件。本 request は fast の入力契約バグのみ扱う。#699 merge 後に #697 を fast で再 run（or 手締め）。
- **③ を architecture の B-invariant にする** — 採らない。input-completeness は data validity であって code structure ではない（`validateJobState` / `validateReviewerDefinitions` と同類）。architecture は「descriptor 検証は pipeline の責務・着手前 seam・pure」という*配置*を `components.md` / `dynamic-model.md` に1行記す程度（別途・out-of-loop）。本 request では in-loop validator のみ。
- **fast の他の step 構成変更 / promote / fixup / magnitude envelope** — 別 request。
- **`test-cases.md` のフォーマット・粒度の変更** — 不変。

## 受け入れ基準

- [ ] `code-review` / `custom-reviewer` の `test-cases.md` read が soft（`verify: false`）になり、欠落時に STEP_INPUT_MISSING を出さない（test）
- [ ] `test-cases.md` が在るときは従来どおり must-scenario 照合に使われる（standard 挙動不変、test）
- [ ] `test-case-gen` が `test-cases.md` 未生成時に自分で `STEP_OUTPUT_MISSING`（相当）で落ちる（producer 保証、test）
- [ ] `validateDescriptorInputCompleteness`（純関数・fs/child_process を import しない）が存在し、必須 read が上流 writes / ambient で満たされない descriptor を violation として返す（unit test）
- [ ] 上記 validator が `pipeline-run.prepare` で **`composeReviewerDescriptor` 後・`bootstrapJob` 前**に実行され、violation 時に throw（job state を作らない）（test）
- [ ] `PIPELINE_REGISTRY` の base descriptor を回す静的 unit test があり、全 descriptor が input-complete（① 適用後）で green
- [ ] fast descriptor が input-complete になったことが validator/test で確認される
- [ ] `standard` / `design-only` の挙動・reviewer activation・transitions が無改変（既存テスト green）
- [ ] `FindingResolution` union は `fixable | decision-needed` のまま
- [ ] `bun run typecheck && bun run test` green、arch 不変条件（B-1〜B-11 ＋ DSM）green

## architect 評価済みの設計判断

- **producer/consumer 分離（B 案）**: consumer（code-review）の必須 read で producer の出力を担保する設計は、producer を消した descriptor（fast）で破綻する。各 step が自分の契約を持つ（test-case-gen が出力を保証、code-review は在れば使う）方が単一責任で descriptor 構成に頑健。
  - 却下 A（reads を descriptor 条件付き必須に）: consumer に pipeline 形状の知識が漏れる。
  - 却下 C（consumer soft 化のみ・producer 保証なし）: fast は通るが standard で「test-case-gen 完了したのに未生成」を誰も検出しなくなる。② で取り戻す。
- **③ は in-loop の data validator であって architecture invariant ではない**: input-completeness は descriptor という data の妥当性であり、コードの構造ルール（B-1〜B-11）とは層が違う。`validateReviewerDefinitions` / `validateJobState` と同類。よって `model.md` §4 への B-x 昇格も CODEOWNERS も不要、pipeline component 内の validator ＋ test で完結する。
- **検算は合成後 descriptor に・着手前 preflight で**: 実行される descriptor は `composeReviewerDescriptor` で runtime 合成される（custom-reviewer も test-cases.md を読む）。静的 registry テストだけでは合成後を見られないので、**authoritative な検算は runtime preflight**（合成後を見る）。静的テストは base の早期検出の補助。
- **依存**: #694（fast pipeline）。fast の STEP_INPUT_MISSING を解消する。#697（INV-8 本体）とは独立。
