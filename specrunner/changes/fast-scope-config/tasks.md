# Tasks: fast pipeline forbidden surfaces の repo config 化

> 依存順: T-01 → T-02 → T-03 が config 層。T-04 → T-05 → T-06 が core/pipeline 層。
> T-07 (dogfooding data) と T-08 (docs) は独立。T-09 / T-10 (tests) は該当実装後。

## T-01: config 層に forbidden surfaces の interface 型を追加する

- [ ] `src/config/schema.ts` に `ForbiddenSurfaceConfig { id: string; paths: string[] }` を追加する（config 層に閉じた型。core の `ForbiddenSurface` とは構造的に代入互換なので import はしない）。
- [ ] `FastPipelineConfig { forbiddenSurfaces?: ForbiddenSurfaceConfig[] }` を追加する。
- [ ] 既存 `PipelineConfig` interface（`maxRetries?` を持つ）に `fast?: FastPipelineConfig` を追加する。
- [ ] `PartialSpecRunnerConfig`（migration 用の緩い型）側で `pipeline` が `Partial<PipelineConfig>` を受けられることを確認する（既存のまま変更不要のはず）。

**Acceptance Criteria**:
- `SpecRunnerConfig["pipeline"]` から `fast.forbiddenSurfaces` に型安全にアクセスできる。
- `typecheck` が green。

## T-02: config zod schema に forbidden surfaces の validation を追加する

- [ ] `src/config/schema.ts` の `configSchema` 内 `pipeline` object（現在 `maxRetries` のみ）に `fast` optional object を追加する。
- [ ] `fast.forbiddenSurfaces` を optional array とし、要素スキーマは `object({ id, paths })`:
  - `id`: 必須 `string`、非空（`minLength(1)`）。欠落 → validation エラー。
  - `paths`: 必須 `array(string 非空, "must be an array.")`。string 等の非配列 → validation エラー。
- [ ] エラーメッセージは既存 `archive.protectedPaths` の書式（`"must be a non-empty string."` / `"must be an array."`）に揃える。

**Acceptance Criteria**:
- `id` 欠落 / `paths` が配列でない config が validation エラーになる。
- well-formed な `forbiddenSurfaces` は validation を通過する。
- 既存の config validation テスト（`tests/schema.test.ts`）が引き続き green。

## T-03: forbidden surfaces の named resolver を追加する

- [ ] `src/config/schema.ts` に `resolvePipelineForbiddenSurfaces(config: SpecRunnerConfig, pipelineId: string): ForbiddenSurfaceConfig[]` を追加する（`resolveArchiveConfig` / `resolveDesignLayerConfig` と同じ場所・責務）。
- [ ] `pipelineId === "fast"` → `config.pipeline?.fast?.forbiddenSurfaces ?? []`。それ以外の id → `[]`。
- [ ] id → config 位置のマッピングはこの resolver 1 箇所に閉じる（他所で `config.pipeline.fast` を直接読まない）。

**Acceptance Criteria**:
- config 宣言ありで `pipelineId="fast"` を渡すと宣言された surfaces を返す。
- config 無指定で `[]` を返す。
- `pipelineId="standard"` 等で常に `[]` を返す。

## T-04: registry から spec-runner 固有リテラルを撤去する

- [ ] `src/core/pipeline/registry.ts` の `FAST_DESCRIPTOR.permissionScope.forbidden` を `[]`（空配列）にする。
- [ ] `checkpoint: STEP_NAMES.CONFORMANCE` は維持する（presence を保つ）。
- [ ] 3 面リテラルと、その選定根拠を記述した doc コメント（`public-types` / `persisted-format` / `state-transitions` の説明）を削除し、「forbidden は config から解決される。空 = 保護対象未宣言」である旨のコメントに差し替える。

**Acceptance Criteria**:
- `registry.ts` に `src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts` のいずれのパスリテラルも残っていない。
- `FAST_DESCRIPTOR.permissionScope` は依然 defined（presence 維持）で `checkpoint === "conformance"`、`forbidden` は空配列。

## T-05: descriptor 変換 `applyScopeConfig` を追加する

- [ ] `src/core/pipeline/resolve-scope.ts`（新規）に `applyScopeConfig(base: PipelineDescriptor, config: SpecRunnerConfig): PipelineDescriptor` を追加する。
- [ ] `base.permissionScope` が undefined → `base` を参照同一で返す（zero-overhead 不変、`composeReviewerDescriptor` の no-op 契約と同型）。
- [ ] presence あり → `{ ...base, permissionScope: { checkpoint: base.permissionScope.checkpoint, forbidden: resolvePipelineForbiddenSurfaces(config, base.id) } }` を返す。
- [ ] config → core の上向き import を作らない（resolver の返り値を構造的代入互換のまま `forbidden` に載せる）。

**Acceptance Criteria**:
- config 宣言ありの fast base に適用すると、`permissionScope.forbidden` が宣言 surfaces と一致し `checkpoint` 不変。
- config 無指定の fast base に適用すると `forbidden` が空・`permissionScope` presence 維持。
- standard / design-only base に適用すると返り値が base と参照同一。
- `typecheck` が green（layer 方向違反なし）。

## T-06: runtime の descriptor 解決経路に変換を配線する

- [ ] `src/core/pipeline/run.ts` の `buildPipelineForJob`: `getPipelineDescriptor` の後に `applyScopeConfig(base, deps.config)` を挟み、その結果を `composeReviewerDescriptor(scoped, jobState.reviewers)` へ渡す。
- [ ] `src/core/pipeline/run.ts` の `runPipeline`: 同様に `applyScopeConfig(base, deps.config)` を挟む。
- [ ] preflight（`src/core/command/pipeline-run.ts`）は変更しない。capability gate は `permissionScope` の presence のみを読み、presence は registry 定数で保たれるため config 非依存で発火することを design D5 の根拠として確認する。

**Acceptance Criteria**:
- fast 実行時、config 宣言済み forbidden が `StepExecutor`（`buildPipeline` の permissionScope 注入経路）まで届く。
- reviewer あり / なしの両方で解決済み scope が保たれる（`composeReviewerDescriptor` の `...scoped` 保持）。
- capability gate の挙動が config の有無で変わらない。

## T-07: spec-runner 自身の config に現行 3 面を移す（dogfooding 維持）

- [ ] リポジトリルートの `.specrunner/config.json` に `pipeline.fast.forbiddenSurfaces` セクションを追加し、現行 3 面を宣言する:
  - `{ id: "public-types", paths: ["src/core/port/**"] }`
  - `{ id: "persisted-format", paths: ["src/state/schema.ts"] }`
  - `{ id: "state-transitions", paths: ["src/state/lifecycle.ts"] }`
- [ ] 既存セクション（`verification` / `steps` / `archive`）は保持する。
- [ ] 本変更（T-04 のリテラル撤去）と同一 PR に含める（design D6: 保護を切れ目なく維持）。

**Acceptance Criteria**:
- `.specrunner/config.json` が valid（version 1、既存キー保持、新 `pipeline.fast.forbiddenSurfaces` に 3 面）。
- この config で fast を実行すると 3 面への接触が conformance で breach 検出される（T-10 で固定）。

## T-08: docs/configuration.md に fast forbidden surfaces を追記する

- [ ] `## Pipeline` セクション（現状 `pipeline.maxRetries` のみ）に fast pipeline と `pipeline.fast.forbiddenSurfaces` の説明サブセクションを追加する。
- [ ] 記載内容: 用途（fast profile が conformance checkpoint で禁止サーフェス接触を機械検出する）、JSON 例（`{ id, paths }` の配列）、無指定 = forbidden 空 = breach なし、`checkpoint` は code 側で config 不可、capability gate は presence で常時適用、deep-merge の array 置換規則（project local が user global を丸ごと置換）。

**Acceptance Criteria**:
- docs に fast pipeline / `permissionScope` / `forbiddenSurfaces` の記述が存在する（現状は無い）。
- 既存 docs テスト（あれば）が green。

## T-09: 既存テストを新既定に合わせて更新する

- [ ] `tests/unit/core/pipeline/fast-descriptor.test.ts` T-04-5（3 surfaces を固定）を更新する: registry 定数側は「`permissionScope` presence あり・`checkpoint === "conformance"`・`forbidden` が空配列」を固定するアサーションに変える。3 面の突合は T-10 の config 解決テストへ移す。
- [ ] `tests/unit/core/step/fast-scope-checkpoint.test.ts` を更新する: breach 系テスト（T-05-1 等）が `FAST_DESCRIPTOR.permissionScope`（現状 3 面リテラル）を直接 breach 源にしている。config fixture から `applyScopeConfig` で組み立てた scope を `StepExecutor` に渡す形へ差し替える。no-breach 系（空 forbidden で approved）は registry 定数のままでも通ることを確認する。
- [ ] `src/core/pipeline/__tests__/compose-reviewers.test.ts` 等、`FAST_DESCRIPTOR` の forbidden 内容に依存する箇所がないか確認する（依存なしの想定）。

**Acceptance Criteria**:
- 更新後の既存テストが green。
- registry の 3 面リテラルに依存するアサーションが残っていない。

## T-10: 新規テストで受け入れ基準を固定する

- [ ] **config validation**: `pipeline.fast.forbiddenSurfaces` の well-formed fixture が validate を通り、`id` 欠落 / `paths` 非配列の fixture が validation エラーになる（`tests/schema.test.ts` に追加、または新規）。
- [ ] **resolver / transform**: `applyScopeConfig` が (a) config 宣言 → forbidden 一致 + checkpoint 不変、(b) 無指定 → forbidden 空 + presence 維持、(c) standard/design-only → 参照同一、を固定する。
- [ ] **breach (acceptance)**: config で forbidden を宣言した fixture で、宣言 paths への接触が conformance checkpoint で breach 検出され `origin:"scope"` / `decision-needed` finding が合成され escalation になる。
- [ ] **no-breach + gate (acceptance)**: config 無指定 fixture で breach が発生せず、かつ `assertRuntimeSupportsScope` が incapable runtime に対し引き続き `UnsupportedRuntimeCapabilityError` を throw する（presence 維持）。
- [ ] **dogfooding**: spec-runner 自身の `.specrunner/config.json` を読み、`pipeline.fast.forbiddenSurfaces` に 3 面が宣言されていることを固定する。

**Acceptance Criteria**:
- request の受け入れ基準（config 宣言時 breach / 無指定時 no-breach + gate 維持 / 不正 config validation エラー / registry リテラル無し / 自 config に 3 面 / `typecheck && test` green）がテストで固定される。
- `bun run typecheck && bun run test` が green。
