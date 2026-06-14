# Cross-Boundary Invariants Review — pipeline-selection-capability-gate — iter 1

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 調査対象

- `src/core/pipeline/runtime-capability-gate.ts`（新規）
- `src/core/command/pipeline-run.ts`（変更）
- `src/parser/request-md.ts` / `src/parser/types.ts` / `src/parser/rules/types.ts`（変更）
- `tests/unit/core/pipeline/runtime-capability-gate.test.ts`（新規）
- `tests/unit/core/command/pipeline-run-gate.test.ts`（新規）
- `tests/unit/core/pipeline/registry-invariants.test.ts`（新規）

---

## 検査項目と結果

### INV-1: parser → pipeline の依存方向（DSM 不変条件）

`pipeline` フィールドを `ParsedRequestRaw` / `ParsedRequest` に追加しているが、`src/parser/rules/index.ts` に pipeline-known ルールを追加していない。バリデーションは下流の `getPipelineDescriptor` に委ねられており、parser 層が `src/core/pipeline` を import していないことを確認した。

**判定**: 不変条件維持 ✓

---

### INV-2: bootstrapJob 前に gate が介在すること

`pipeline-run.ts` の `prepare()` 内の実行順序:

```
1. validateReviewerDefinitions()  ← 既存 preflight（前例）
2. getPipelineDescriptor(pipelineId)
3. assertRuntimeSupportsScope(descriptor, this.runtime)   ← 新規 gate
4. bootstrapJob(...)               ← state 作成
```

gate が throw した場合、`bootstrapJob` は呼ばれない。`bootstrapJob` は in-memory であり、state の永続化は `setupWorkspace` まで遅延されているため、gate 発火 → job state/worktree は一切作られない。T-05-1 テストが `bootstrapJob` spy の未呼び出しを assert して機械的に固定している。

**判定**: 不変条件維持 ✓

---

### INV-3: canDeriveChangedFiles optional chaining の意味論（#692 の seam 契約）

gate の判定式は `runtime.canDeriveChangedFiles?.() === false`。

- `false` → gate 発火
- `true` → 通過
- absent（`undefined`） → `undefined === false` → `false` → 通過

これは `runtime-strategy.ts` の契約（"absent = fall through to listChangedFiles path"）と一致している。T-04-3 が absent fake で throw しないことを固定している。

**判定**: #692 との境界不変条件維持 ✓

---

### INV-4: gate 判定が profile 名に依存しないこと

`assertRuntimeSupportsScope` の実装を精読した。`descriptor.id` の値でのハードコード分岐は存在せず、`permissionScope !== undefined` のみで判定する。T-04-5 が複数 id（"fast", "fixture-alpha", "fixture-beta" 等）で一様に throw することを確認している。

**判定**: 不変条件維持 ✓

---

### INV-5: PIPELINE_REGISTRY の production 不変性

`PIPELINE_REGISTRY` の初期化子は "standard" / "design-only" の 2 本のままで、scope 宣言 profile は追加されていない。T-06-3 がエントリ数 2 本・`permissionScope` 宣言 0 件を固定している。

テストが `PIPELINE_REGISTRY` をミューテートする（T-05）点について: Vitest はファイル単位でモジュールインスタンスを分離するため、別ファイル（`registry-invariants.test.ts`）の `PIPELINE_REGISTRY` インスタンスには影響しない。同一ファイル内では `beforeEach`/`afterEach` の対称操作で cleanup している。

**判定**: 不変条件維持 ✓

---

### INV-6: エラー伝播経路（UnsupportedRuntimeCapabilityError → CLI 出力）

`UnsupportedRuntimeCapabilityError extends Error` であり、`cli/run.ts:100-102` の catch が `(err as Error).message` を `logError` に渡す。既存の `ReviewerValidationError`（bootstrap 前 throw の前例）と同じ表面化経路に自然に乗る。exit code 1 で終了する。

**判定**: 不変条件維持 ✓

---

### INV-7: resume 経路に gate が存在しないこと（設計による）

`ResumeCommand.prepare()` は `assertRuntimeSupportsScope` を呼ばない。これは「gate は job 生成前の preflight」という設計意図に基づく明示的な決定であり（D3）、#689 の checkpoint escalation が backstop として機能する。

**判定**: 設計による非適用。不変条件違反ではない ✓

---

### INV-8（LOW）: `pipeline: design-only` ＋ custom reviewers → job state に orphaned reviewer snapshots

**発生条件**: リポジトリに `specrunner/reviewers/*.md` が存在する状態で、request.md に `pipeline: design-only` を指定して `specrunner run` を実行した場合。

**経路**:

1. `loadReviewerDefinitions` がファイルシステムから reviewers を読み込む
2. `jobState.reviewers = reviewers`（非空）にスナップショットされる
3. `runner.ts` の `buildPipelineForJob(jobState, deps)` が `composeReviewerDescriptor(DESIGN_ONLY_DESCRIPTOR, jobState.reviewers)` を呼ぶ
4. `DESIGN_ONLY_DESCRIPTOR.steps` には `conformance` が存在しないため、reviewer chain が末尾に zombie steps として挿入される
5. `DESIGN_ONLY_DESCRIPTOR.transitions` は `design → success → end` なので、`design` step 完了後に pipeline は "end" に直行する
6. zombie steps（custom reviewers, regression-gate）は実行されない

**実際の挙動**: pipeline は正しく実行される（design → end）。ただし `jobState.reviewers` が非空のまま残り、アーカイブされた job state を参照するツールが "reviewers が設定されているが一度も実行されていない job" として観測する。

**既存との差分**: 本変更前は `design-only` が `pipeline-run.ts` 経由で起動できなかった（`runDesignPipeline` は test-only/dead path）。本変更により Meta `pipeline: design-only` が production で到達可能になり、この新経路でのみ発生する。

**設計書の対応**: design.md D6 は「Meta 経由 design-only が既存経路を壊さない」ことを担保するとしているが、custom reviewers との交差ケースを明示的に扱っていない。T-06 も `DESIGN_ONLY_DESCRIPTOR.permissionScope === undefined` を検証するにとどまり、reviewer snap との組み合わせはカバー外。

**機能的影響**: なし（正常終了、state 永続化・archive・PR 作成への影響なし）。ただし `jobState.reviewers` が非空で実行なし、という論理的不整合がデータに残る。

**判定**: LOW。本 request の scope（infra・挙動中立）を逸脱しない範囲の振る舞いであり、merge を妨げない。後続 request （fast-pipeline または cleanup request）で、pipeline capability に基づく reviewer snapshot フィルタリングを検討する余地がある。

---

## サマリー

| # | 不変条件 | 判定 |
|---|---------|------|
| INV-1 | parser → pipeline DSM 方向 | ✓ 維持 |
| INV-2 | gate が bootstrapJob 前に介在 | ✓ 維持 |
| INV-3 | canDeriveChangedFiles optional 意味論（#692） | ✓ 維持 |
| INV-4 | gate が profile 名に依存しない | ✓ 維持 |
| INV-5 | PIPELINE_REGISTRY の production 不変性 | ✓ 維持 |
| INV-6 | UnsupportedRuntimeCapabilityError 伝播経路 | ✓ 維持 |
| INV-7 | resume 経路は gate 対象外（設計による） | ✓ 設計通り |
| INV-8 | design-only + custom reviewers → orphaned snapshot | LOW（機能影響なし） |

実装は受け入れ基準（B-1〜B-11 ＋ DSM closure）を満たしており、検出された LOW finding は機能的正しさに影響しない。
