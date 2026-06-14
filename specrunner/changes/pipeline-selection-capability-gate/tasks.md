# Tasks: pipeline を request.md で選択可能にし、scope を強制できない runtime を着手前に拒否する汎用 gate

> 既定挙動完全一致が最重要。各タスクは additive・後方互換で、`pipeline` 未指定・`permissionScope` 非宣言では現行と完全一致すること。gate が発火するのは「`permissionScope` 宣言あり ＋ `canDeriveChangedFiles?.() === false`」の交差のみ。本 request では scope 宣言 profile を `PIPELINE_REGISTRY` に足さない＝production で gate は inert。実 profile が無いため gate test は test-only fixture descriptor で駆動する（#688/#692 の前例どおり）。

## T-01: request.md Meta に optional `pipeline` を追加（parser・additive・抽出のみ）

- [x] `src/parser/rules/types.ts` の `ParsedRequestRaw` に `pipeline: string | undefined` を追加する（`issue` と同型）。
- [x] `src/parser/types.ts` の `ParsedRequest` に `/** Pipeline id from Meta section (registry id). undefined = standard. */ pipeline?: string;` を追加する。
- [x] `src/parser/request-md.ts` の `parseRequestMdRaw` に Meta 抽出を追加する: `issue` の抽出ブロックに倣い、`- **pipeline**: <value>` を正規表現 `^\s*-\s+\*\*pipeline\*\*:\s+(.+)$` で抽出し `pipeline`（trim 済み）を返す。absent → `undefined`。
- [x] `parseRequestMdContent` の戻り値オブジェクトに `pipeline: raw.pipeline` を追加する。
- [x] **validation rule は足さない**（`src/parser/rules/index.ts` は無改変）。値の妥当性（既知 id か）は下流の `getPipelineDescriptor` に委ねる。parser 層は `src/core/pipeline` を import しない（DSM 維持）。

**Acceptance Criteria**:
- Meta に `- **pipeline**: design-only` を含む request.md を `parseRequestMdContent` でパースすると `pipeline === "design-only"`（test）。
- `pipeline` 行を含まない request.md では `pipeline === undefined`（test）。
- `src/parser/rules/index.ts` に新 rule が登録されておらず、parser が `src/core/pipeline` を import しない（diff / DSM 検査）。
- `bun run typecheck` が green。

## T-02: capability gate 純関数 ＋ typed error を新モジュールに追加（domain・pure）

- [x] 新規 `src/core/pipeline/runtime-capability-gate.ts` を作成する（fs / child_process / env / SDK を import しない純モジュール）。
- [x] `export class UnsupportedRuntimeCapabilityError extends Error` を定義する: コンストラクタで `pipelineId: string` を保持し（`public readonly`）、`this.name = "UnsupportedRuntimeCapabilityError"` を設定する。message は「選択された pipeline `<pipelineId>` は permissionScope を宣言しており、changed-files を導出できる runtime が必要だが、現在の runtime はそれを満たさない」旨＋代替案内（`standard` を選ぶ／permissionScope を宣言しない profile を選ぶ／changed-files を導出できる runtime で実行する）。**「local」という種別名に依存しない文言**にする（D4）。
- [x] `export function assertRuntimeSupportsScope(descriptor: PipelineDescriptor, runtime: Pick<RuntimeStrategy, "canDeriveChangedFiles">): void` を定義する。判定は `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false` のときのみ `throw new UnsupportedRuntimeCapabilityError(descriptor.id)`。それ以外（permissionScope 不在／predicate `true`／predicate absent）は何もしない（return）。
- [x] `PipelineDescriptor` 型は `./types.js`、`RuntimeStrategy` 型は `../port/runtime-strategy.js` から **type-only import** する（`core/pipeline → core/port` は既存の許可 edge。`run.ts` / `reviewer-chain.ts` に前例）。
- [x] **profile 名（`descriptor.id` の値）で分岐しない**こと。`id` は error message 用にのみ参照する。

**Acceptance Criteria**:
- `assertRuntimeSupportsScope`: `permissionScope` 宣言ありの fixture descriptor ＋ `canDeriveChangedFiles: () => false` の fake で `UnsupportedRuntimeCapabilityError` を throw する（T-04 で test）。
- `permissionScope` 不在、または `canDeriveChangedFiles` が `true`／未実装（absent）のときは throw しない（T-04 で test）。
- 判定が `descriptor.id` の値に依存しない（`fast` 等のハードコード分岐が無いことを実装・test で固定）。
- 新モジュールが fs/child_process/env/SDK を import せず、`core/pipeline → core/port` 以外の新規逆 edge を作らない（DSM 不変）。
- `bun run typecheck` が green。

## T-03: pipeline-run.ts で pipelineId を解決し、gate を bootstrapJob 前に配線

- [x] `src/core/command/pipeline-run.ts` の `prepare()` で、`validateReviewerDefinitions(reviewerDefs)` の後・`bootstrapJob` の前に以下を行う:
  - `const pipelineId = request.pipeline ?? STANDARD_PIPELINE_ID;`
  - `const descriptor = getPipelineDescriptor(pipelineId);`（未知 id はここで既存エラーが throw され、bootstrap に到達しない）
  - `assertRuntimeSupportsScope(descriptor, this.runtime);`（違反時 `UnsupportedRuntimeCapabilityError` で停止、state 未作成）
- [x] `bootstrapJob` 呼び出しの `pipelineId: STANDARD_PIPELINE_ID`（現 `:92`）を `pipelineId,`（解決済み値）へ置き換える。
- [x] import を追加する: `getPipelineDescriptor` を `../pipeline/registry.js`（または `../pipeline/index.js`）から、`assertRuntimeSupportsScope` を `../pipeline/runtime-capability-gate.js` から（`core/command → core/pipeline` は既存 edge。`runner.ts` に前例）。`STANDARD_PIPELINE_ID` は既存 import を流用。
- [x] `pipeline` 未指定（`request.pipeline === undefined`）のとき `pipelineId === "standard"` となり、`bootstrapJob` への引数・以降の挙動が現行と完全一致すること（diff で確認）。

**Acceptance Criteria**:
- `pipeline` 未指定の run で `bootstrapJob` に渡る `pipelineId` が `"standard"`（現行と一致）（test）。
- `request.pipeline` 指定時、解決した id が `bootstrapJob` に渡り state に記録される（T-05/T-06 で test）。
- 未知 id は `getPipelineDescriptor` の既存エラーで停止し `bootstrapJob` に到達しない（T-05 で test）。
- gate 呼び出しは `bootstrapJob` の **前** に位置する（diff / call-site 順序で確認）。
- `bun run typecheck` が green。

## T-04: gate 純関数の単体テスト（fixture descriptor 駆動、profile 名非依存）

- [x] 新規テスト（例 `tests/unit/core/pipeline/runtime-capability-gate.test.ts`）を追加し、**test-only fixture descriptor** を組む: `STANDARD_DESCRIPTOR` を spread して `permissionScope: { checkpoint: "code-review", forbidden: [] }` と任意の `id` を上書きした最小 descriptor を作る（registry には登録しない）。
- [x] `canDeriveChangedFiles: () => false` の fake で `assertRuntimeSupportsScope(fixture, fake)` が `UnsupportedRuntimeCapabilityError` を throw することを固定する。throw された error の `message` が「changed-files を導出できる runtime が必要」旨を含み、「local」という種別名に依存しない文言であることを assert する。
- [x] `canDeriveChangedFiles: () => true` の fake、および `canDeriveChangedFiles` を実装しない fake（absent）で throw しないことを固定する。
- [x] `permissionScope` を持たない fixture（`STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` そのまま）では、`canDeriveChangedFiles: () => false` の fake でも throw しないことを固定する。
- [x] **profile 名非依存**を固定する: `permissionScope` 宣言ありの fixture を互いに異なる複数の `id`（`fast` を含めても含めなくてもよいが `fast` だけに依存しない構成）で作り、いずれも `canDeriveChangedFiles: () => false` で一様に throw することを assert する（id ごとの分岐が無い証明）。

**Acceptance Criteria**:
- scope 宣言 ＋ `false` → throw、`true`/absent → 通過、scope 非宣言 → 通過（test）。
- error message が能力ベースで、種別名（local/managed）にハードコード依存しない（test）。
- gate 挙動が `descriptor.id` の値に依存しない（複数 id で一様）（test）。
- `bun run typecheck && bun run test` が green。

## T-05: call-site 結合テスト（着手前 reject・bootstrapJob 未呼び出し・未知 id）

- [x] `prepare()` 内で gate が `bootstrapJob` の前に効くことを駆動するため、test スコープで一時的に registry へ fixture descriptor を挿入する: `beforeEach` で `(PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)["<unique-fixture-id>"] = { ...STANDARD_DESCRIPTOR, id: "<unique-fixture-id>", permissionScope: { checkpoint: "code-review", forbidden: [] } }` を設定し、`afterEach` で `delete` する（production registry 初期化子は無改変＝受け入れ基準「scope 宣言 profile が増えていない」を維持）。
- [x] `PipelineRunCommand` を、`canDeriveChangedFiles: () => false` ＋ `bootstrapJob` を spy（`vi.fn()`）にした fake runtime と、`request.pipeline = "<unique-fixture-id>"` の `preflightResult` で構成し、`prepare()`（または `execute()`）が `UnsupportedRuntimeCapabilityError` で reject し、**`bootstrapJob` spy が未呼び出し**であることを assert する（job state が作られないことの behavioral 証明）。`prepare()` は protected なので、薄い test サブクラスで公開するか `execute()` 経由で駆動する（どちらでも可）。
- [x] 同 fixture ＋ `canDeriveChangedFiles: () => true` の fake では gate を通過し `bootstrapJob` が呼ばれ、渡る `pipelineId` が fixture id であることを assert する（通過経路と pipelineId 記録の確認）。
- [x] 未知 id: `request.pipeline = "bogus"`（registry 未登録）で `prepare()` が `getPipelineDescriptor` の既知 id 一覧付きエラーで reject し、`bootstrapJob` spy が未呼び出しであることを assert する。
- [x] `pipeline` 未指定（`request.pipeline === undefined`）で `bootstrapJob` に渡る `pipelineId` が `"standard"` であることを assert する（既定経路の回帰防止）。

**Acceptance Criteria**:
- scope 宣言 fixture ＋ `canDerive=false` で着手前に reject し、`bootstrapJob` が呼ばれない（job state 未作成）（test）。
- scope 宣言 fixture ＋ `canDerive=true` で通過し `pipelineId` が記録される（test）。
- 未知 id は既存 registry エラーで停止し state を作らない（test）。
- `pipeline` 未指定 → `pipelineId="standard"`（test）。
- `afterEach` 後に `PIPELINE_REGISTRY` が元の 2 本に戻っている（テスト間リークなし）。

## T-06: Meta 経由 design-only の到達性・無害性、既定挙動・registry・FindingResolution 不変の検証

- [x] Meta `pipeline: design-only` のとき `pipelineId = "design-only"` が解決され、`getPipelineId` → `getPipelineDescriptor` 経由で `DESIGN_ONLY_DESCRIPTOR` に到達することを test で固定する（読解確認の機械化）。
- [x] `DESIGN_ONLY_DESCRIPTOR.permissionScope` が `undefined` であることを確認し、Meta 経由 design-only が gate を通過する（副作用が既存経路を壊さない）ことを test で固定する。
- [x] `runDesignPipeline`（test-only/dead path）は無改変であり、`tests/pipeline.test.ts` の既存 design-only テストが無変更で green であることを確認する（併存・非統合）。
- [x] `PIPELINE_REGISTRY` が `standard` / `design-only` の 2 本のままで、`permissionScope` を宣言する profile が 0 件であることを test で固定する（gate が production で inert）。
- [x] `pipeline` 未指定の既定経路・`standard` の挙動・reviewer activation が無変更であることを既存テスト（無改変 green）で確認する。
- [x] `FindingResolution` の妥当値集合が `fixable` / `decision-needed` の 2 値のままであることを既存 test（`VALID_RESOLUTIONS` 検証）で確認する（新 resolution 値を足さない）。

**Acceptance Criteria**:
- Meta `pipeline: design-only` が `DESIGN_ONLY_DESCRIPTOR` に到達し、`pipelineId="design-only"` を記録する（test）。
- Meta 経由 design-only は gate を通過する（permissionScope 無し）（test）。
- `PIPELINE_REGISTRY` が 2 本のまま・scope 宣言 profile 0 件（test）。
- `runDesignPipeline` 既存テスト・activation テスト・`FindingResolution` union が無変更で green。

## T-07: 全体検証（既定挙動完全一致と arch 不変条件の最終確認）

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（既存テストは無変更、または additive 拡張のみで green）。
- [x] `bun run lint`（`--max-warnings 0`）が green（未使用引数は `^_` prefix で吸収）。
- [x] arch 不変条件 B-1〜B-11 ＋ DSM closure が green: 新モジュール `runtime-capability-gate.ts` は domain（`core/pipeline`）の純関数で、`core/pipeline → core/port`（既存許可 edge）以外の逆 edge を作らない。parser は `core/pipeline` を import しない。
- [x] scope 宣言 profile が registry に無いため gate が一切発火し得ず、既定挙動（`pipeline` 未指定・`standard`・`design-only`・reviewer activation）が完全一致であることを確認する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- arch 不変条件（B-1〜B-11 ＋ DSM closure）が green。
- 既定挙動完全一致（`pipeline` 未指定で現行と一致、gate は production inert）が test で担保されている。
