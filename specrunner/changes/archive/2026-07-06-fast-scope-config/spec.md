# Spec: fast pipeline forbidden surfaces の repo config 化

自己完結の behavior spec。型 / FSM / 構造が自動で強制しない Layer-1 の振る舞いを固定する。

## Requirements

### Requirement: config で fast の forbidden surfaces を宣言できる

`.specrunner/config.json`（および user global config）の `pipeline.fast.forbiddenSurfaces` に、`{ id: string, paths: string[] }` の配列で fast pipeline の禁止サーフェスを宣言できる MUST。user global と project local の両方が存在するときは既存の deep-merge 規則（array は project local が丸ごと置換）に従う SHALL。

#### Scenario: project local config で forbidden surfaces を宣言

**Given** `.specrunner/config.json` の `pipeline.fast.forbiddenSurfaces` に `[{ id: "public-types", paths: ["src/core/port/**"] }]` が宣言されている
**When** config を load する
**Then** load された config の `pipeline.fast.forbiddenSurfaces` にその 1 面が含まれる

#### Scenario: user global と project local の array は project local が置換する

**Given** user global に forbidden surfaces が 2 面、project local に 1 面宣言されている
**When** 両者を deep-merge する
**Then** merge 結果の forbiddenSurfaces は project local の 1 面のみ（array 置換）になる

### Requirement: fast descriptor は forbidden surfaces を config から解決する

fast pipeline を実行するとき、実効 `PipelineDescriptor.permissionScope.forbidden` は config の `pipeline.fast.forbiddenSurfaces` から解決される MUST。config に宣言があればそれを用い、registry の静的定数はハードコードされたパスリテラルを持たない SHALL。`checkpoint` は config 化されず conformance のまま code に残る MUST。

#### Scenario: config 宣言が実効 descriptor の forbidden になる

**Given** config の `pipeline.fast.forbiddenSurfaces` に 3 面が宣言されている
**When** fast descriptor を解決する（base descriptor + config → 実効 descriptor）
**Then** 実効 descriptor の `permissionScope.forbidden` はその 3 面と一致し、`permissionScope.checkpoint` は `"conformance"` である

#### Scenario: registry の静的定数に spec-runner 固有パスが残っていない

**Given** `src/core/pipeline/registry.ts` の `FAST_DESCRIPTOR`
**When** `permissionScope.forbidden` を参照する
**Then** `src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts` のいずれのパスリテラルも含まれない（空配列）

### Requirement: 宣言 paths への接触が conformance checkpoint で breach 検出される

config で forbidden surfaces を宣言した状態で、変更ファイルが宣言 paths にマッチするとき、conformance checkpoint で scope breach が導出され `origin:"scope"` / `resolution:"decision-needed"` の finding が合成されて escalation になる MUST。

#### Scenario: 宣言 path への接触で breach

**Given** config で `{ id: "public-types", paths: ["src/core/port/**"] }` を宣言した fast の実効 descriptor
**And** changed files に `src/core/port/runtime-strategy.ts` が含まれる
**When** conformance checkpoint で scope 評価が走る
**Then** verdict が escalation になり、`origin:"scope"` の decision-needed finding が 1 件合成される

### Requirement: config 無指定なら forbidden は空で breach は発生しない

config に `pipeline.fast.forbiddenSurfaces` が無いとき、実効 descriptor の forbidden は空配列であり、いかなる変更ファイルに対しても scope breach は発生しない MUST。

#### Scenario: 無指定なら breach なし

**Given** config に `pipeline.fast.forbiddenSurfaces` が宣言されていない
**And** changed files に `src/core/port/runtime-strategy.ts` が含まれる
**When** conformance checkpoint で scope 評価が走る
**Then** scope breach は発生せず、scope finding は合成されない

### Requirement: forbidden が空でも scope presence を維持し capability gate が適用される

fast descriptor は forbidden が空でも `permissionScope` の presence を保つ MUST。これにより runtime capability gate（changed files を導出できない runtime での着手前 reject）が config の有無に関わらず fast に適用される SHALL。

#### Scenario: 無指定でも capability gate が発火する

**Given** config に forbidden surfaces が無い fast descriptor（forbidden 空・permissionScope presence あり）
**And** `canDeriveChangedFiles()` が false を返す runtime
**When** capability gate（`assertRuntimeSupportsScope`）を評価する
**Then** `UnsupportedRuntimeCapabilityError` が throw される

### Requirement: 不正な forbidden surfaces config は validation エラーになる

`pipeline.fast.forbiddenSurfaces` の要素が well-formed でない（`id` 欠落、`paths` が配列でない 等）とき、config validation はエラーを返す MUST。

#### Scenario: id 欠落

**Given** `forbiddenSurfaces` に `{ paths: ["src/x.ts"] }`（id 欠落）を含む config
**When** config を validate する
**Then** validation エラーになる

#### Scenario: paths が配列でない

**Given** `forbiddenSurfaces` に `{ id: "x", paths: "src/x.ts" }`（paths が string）を含む config
**When** config を validate する
**Then** validation エラーになる

### Requirement: 非 scope pipeline は変換で影響を受けない

`permissionScope` を持たない descriptor（standard / design-only）は、scope 解決変換を通しても不変（参照同一）である MUST。

#### Scenario: standard descriptor は変換後も permissionScope を持たない

**Given** `permissionScope` を持たない standard descriptor
**When** scope 解決変換を適用する
**Then** 返り値は元の descriptor と参照同一で、`permissionScope` は依然 undefined

### Requirement: spec-runner 自身の config が現行 3 面を宣言する

spec-runner 自身の `.specrunner/config.json` は `pipeline.fast.forbiddenSurfaces` に現行 3 面（public-types / persisted-format / state-transitions）を宣言し、自 repo の dogfooding 保護を切れ目なく維持する MUST。

#### Scenario: 自 repo config に 3 面が宣言されている

**Given** spec-runner repo の `.specrunner/config.json`
**When** `pipeline.fast.forbiddenSurfaces` を参照する
**Then** `public-types`(`src/core/port/**`) / `persisted-format`(`src/state/schema.ts`) / `state-transitions`(`src/state/lifecycle.ts`) の 3 面が宣言されている
