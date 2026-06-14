# Spec: pipeline を request.md で選択可能にし、scope を強制できない runtime を着手前に拒否する汎用 gate

## Requirements

### Requirement: request.md Meta は optional な pipeline 選択を受け付け、absent は standard に解決する

request.md の Meta セクションは optional フィールド `pipeline` を受け付け、parser SHALL extract it into `ParsedRequest.pipeline` without adding a validation rule, and when the field is absent the resolved pipeline MUST be `standard`（既存挙動完全一致）。

`pipeline` は `issue` と同型の additive・optional フィールドである。parser 層は値の妥当性（registry の既知 id か）を検証しない。job 生成時、解決される pipelineId は `request.pipeline ?? "standard"` であり、`pipeline` 未指定なら従来と完全一致する。

#### Scenario: pipeline 指定を抽出する

**Given** Meta に `- **pipeline**: design-only` を含む request.md
**When** `parseRequestMdContent` でパースする
**Then** `ParsedRequest.pipeline` が `"design-only"` になる

#### Scenario: pipeline 未指定は undefined・standard 解決

**Given** Meta に `pipeline` 行を含まない request.md
**When** パースして job を生成する
**Then** `ParsedRequest.pipeline` は `undefined` で、job の pipelineId は `standard` になる（既存挙動と一致）

### Requirement: 未知の pipeline id は着手前に既存の registry エラーで弾かれる

When `request.pipeline` is a value not registered in `PIPELINE_REGISTRY`, the system SHALL reject the run before `bootstrapJob` via the existing `getPipelineDescriptor` error（既知 id 一覧付き）, and no job state MUST be created.

未知 id の妥当性検証は parser ではなく `getPipelineDescriptor`（`src/core/pipeline/registry.ts`）の既存エラーに集約される。これは job 生成（`bootstrapJob`）より前に評価される。

#### Scenario: 未知 id は既知 id 一覧付きエラーで停止

**Given** `request.pipeline` が registry に無い id（例 `"bogus"`）
**When** `prepare()` が descriptor を解決する
**Then** `getPipelineDescriptor` が既知 id 一覧を含むエラーを throw し、`bootstrapJob` に到達せず job state は作られない

### Requirement: permissionScope を宣言する profile は changed-files を導出できる runtime を着手前に要求する

When the resolved pipeline descriptor declares `permissionScope` (`!== undefined`) and `runtime.canDeriveChangedFiles?.()` returns `false`, the system SHALL throw a typed `UnsupportedRuntimeCapabilityError` BEFORE `bootstrapJob`, and no job state MUST be created.

着手前 preflight（`validateReviewerDefinitions` と同じ前例位置、`bootstrapJob` の直前）で判定する。`bootstrapJob` は jobId 採番・初期 JobState 構築を担うため、その前で throw すれば state file も worktree も生まれない。エラー文言は「changed-files を導出できる runtime が必要」と能力で表現し、`standard` を選ぶ／permissionScope 宣言の無い profile を選ぶ／導出可能な runtime で実行する、の代替を案内する。

#### Scenario: scope 宣言 ＋ 導出不能 runtime は着手前に停止し state を作らない

**Given** `permissionScope` を宣言した fixture descriptor と、`canDeriveChangedFiles()` が `false` を返す runtime
**When** その pipeline で run を開始しようとする
**Then** `bootstrapJob` の前に `UnsupportedRuntimeCapabilityError` が throw され、`bootstrapJob` は呼ばれず job state は一切作られない

#### Scenario: エラー文言は runtime 種別名でなく能力で表現する

**Given** gate が throw した `UnsupportedRuntimeCapabilityError`
**When** その message を確認する
**Then** 「changed-files を導出できる runtime が必要」旨と代替案内を含み、「local」固有の表現に依存しない

### Requirement: gate 判定は permissionScope の有無から導出し profile 名で分岐しない

The capability gate SHALL derive its decision solely from `descriptor.permissionScope !== undefined` and the runtime predicate, and MUST NOT branch on the pipeline id or profile name（例 `pipelineId === "fast"`）.

判定は「scope を宣言することの性質」であり特定 profile に固有でない。将来の scope 宣言 profile は descriptor 登録だけで同じ gate を継承する。

#### Scenario: permissionScope を持つ任意 id が同一に gate される

**Given** `permissionScope` を宣言した fixture descriptor を、互いに異なる任意の id（`fast` 以外を含む）で構成する
**When** `canDeriveChangedFiles()===false` の runtime で gate を評価する
**Then** id に依らず一様に `UnsupportedRuntimeCapabilityError` で停止する（profile 名のハードコード分岐が無い）

#### Scenario: permissionScope を持たない profile は id に依らず gate を通過する

**Given** `permissionScope` を宣言しない descriptor（`standard` / `design-only` を含む）
**When** 任意の runtime で gate を評価する
**Then** gate は throw せず通過する

### Requirement: canDeriveChangedFiles が true または absent のとき gate は通過する

When `runtime.canDeriveChangedFiles?.()` returns `true` or the predicate is absent (`undefined`), the gate MUST pass even if the descriptor declares `permissionScope`, falling through to `bootstrapJob`.

`canDeriveChangedFiles?.() === false` の厳密比較のみが gate を発火させる。`true` は明示的に導出可能、absent（predicate 未実装の fake 等）は #692 の seam 契約どおりフォールスルーする。

#### Scenario: 導出可能 runtime は scope 宣言 profile を通過する

**Given** `permissionScope` を宣言した fixture descriptor と、`canDeriveChangedFiles()` が `true` を返す runtime
**When** gate を評価する
**Then** gate は throw せず通過し、`bootstrapJob` に進む

#### Scenario: predicate 未実装の runtime は通過する

**Given** `permissionScope` を宣言した fixture descriptor と、`canDeriveChangedFiles` を実装しない runtime（absent）
**When** gate を評価する
**Then** `undefined === false` は偽となり gate は通過する

### Requirement: registry は不変で gate は production で発火せず、既定挙動が完全一致する

`PIPELINE_REGISTRY` MUST NOT gain any `permissionScope`-declaring profile in this change, so the gate SHALL be inert in production, and the default path（`pipeline` 未指定 → `standard`）, `design-only`, and reviewer activation MUST behave identically to current behavior.

本 request は selection 機構と汎用 gate のみを納め、scope 宣言 profile は足さない。したがって production で gate は発火し得ず、既存テストは無変更で green になる。

#### Scenario: registry に scope 宣言 profile が増えていない

**Given** 本 request 適用後の `PIPELINE_REGISTRY`
**When** 登録 descriptor を列挙する
**Then** `standard` と `design-only` の 2 本のみで、`permissionScope` を宣言する profile は 0 件である

#### Scenario: 既定経路の挙動が無変更

**Given** `pipeline` 未指定の request（既存挙動）
**When** job を実行する
**Then** pipelineId は `standard` に解決され、`standard` / reviewer activation の挙動・遷移が現行と完全一致する（既存テストが無変更で green）

### Requirement: Meta 経由 design-only は DESIGN_ONLY_DESCRIPTOR に到達し既存経路を壊さない

When `request.pipeline` is `design-only`, the system SHALL record `pipelineId = "design-only"` and route through the normal command path to `DESIGN_ONLY_DESCRIPTOR`, and because that descriptor declares no `permissionScope` the gate MUST remain inert（副作用は無害）。

Meta 経由 design-only は production で `DESIGN_ONLY_DESCRIPTOR` に到達する初の経路だが、`runDesignPipeline`（test-only/dead path）とは併存し、本 request では統合しない。

#### Scenario: Meta design-only が DESIGN_ONLY_DESCRIPTOR に解決される

**Given** `request.pipeline` が `"design-only"`
**When** job を生成し pipeline を構築する
**Then** `pipelineId` は `"design-only"` として記録され、`getPipelineDescriptor` 経由で `DESIGN_ONLY_DESCRIPTOR` に到達する

#### Scenario: Meta design-only は gate を通過する（permissionScope 無し）

**Given** `request.pipeline` が `"design-only"`（`permissionScope` 宣言なし）
**When** 任意の runtime で gate を評価する
**Then** gate は throw せず通過する

### Requirement: FindingResolution の妥当値集合は不変

The `FindingResolution` union MUST remain exactly `fixable | decision-needed`; this change SHALL NOT add any new resolution value.

本 request は selection 機構と gate のみを足し、finding の resolution 体系には触れない。

#### Scenario: resolution 妥当値は 2 値のまま

**Given** finding の resolution 妥当値集合
**When** 妥当値を列挙する
**Then** 値は `fixable` と `decision-needed` の 2 つだけである（新 resolution 値なし）
