# pipeline を request.md で選択可能にし、scope を強制できない runtime を着手前に拒否する汎用 gate を入れる

## Meta

- **type**: spec-change
- **slug**: pipeline-selection-capability-gate
- **base-branch**: main
- **adr**: true

## 背景

#689（scope 宣言＋超過の機械導出）と #692（評価不能 runtime の fail-closed）で scope 機構は揃ったが、(1) `permissionScope` を宣言する profile はまだ無く（機構は inert）、(2) そもそも **job 生成時に pipeline を選択する機構が存在しない**（`pipelineId` はハードコード）。

本 request は **挙動中立の土台 infra** を入れる:
- **(a) request.md で pipeline を選択できるようにする**。
- **(b) `permissionScope` を宣言する profile は changed-files を導出できる runtime を要求する、という汎用 gate を着手前（job 生成前）に置く**。

これは「scope を宣言することの性質」であって特定 profile の性質ではない。最初の利用者（軽量 `fast` pipeline）は**別 request（`fast-pipeline`）**で追加する。本 request 単体では scope を宣言する profile を **1 つも足さない**ため、gate は production で発火せず、`pipeline` 未指定なら従来どおり `standard`。つまり「**選択できるようになったが既存挙動は完全に不変**」。本 request は #689 / #692 の上に乗る（両者マージ済み）。

### 現状コードの前提（検証済み）

- registry は `STANDARD_DESCRIPTOR`（`src/core/pipeline/registry.ts:30`）と `DESIGN_ONLY_DESCRIPTOR`（`:83`）の 2 本のみ（`PIPELINE_REGISTRY` `:107`、解決は `getPipelineDescriptor` `:116`、未知 id は同関数が throw）。
- **pipeline を front で選択する機構は無い**。job 生成時 `pipelineId` は `STANDARD_PIPELINE_ID` にハードコード（`src/core/command/pipeline-run.ts:92`、bootstrap は同 `:83` `this.runtime.bootstrapJob`）。projection 解決は `getPipelineId`（`src/state/pipeline-id.ts:20`、absent→`STANDARD_PIPELINE_ID` fallback）。
- bootstrap 直前に **「検査して throw＝状態を作らない」前例**がある: `validateReviewerDefinitions(reviewerDefs)` が `bootstrapJob` の前で throw（`pipeline-run.ts:71-79`、コメント「Load and validate ... BEFORE bootstrapping job」）。`runtime` はコンストラクタ依存なので bootstrap 前に `canDeriveChangedFiles()` を呼べる。
- `PermissionScope`（`src/core/pipeline/types.ts:49`）は `checkpoint: string` ＋ `forbidden: ForbiddenSurface[]`。descriptor に `permissionScope` が無い＝scope 宣言なし。
- runtime は config（`src/config/schema.ts` `runtime`）で決まり、`factory.ts:37/44` が `LocalRuntime`/`ManagedRuntime` を生成。`canDeriveChangedFiles` は local→`true` / managed→`false`（#692、`RealRuntimeStrategy` で必須化）。`RuntimeStrategy` 上は optional（fake 非干渉）。
- request.md Meta は `request-md.ts` が `type/slug/base-branch/adr` を `ParsedRequest` へ解析。**`pipeline` フィールドは現状無い**（grep 0 件）。

## 要件

最重量の変更を名指しする: **(a) request.md Meta で pipeline を選択でき、(b) `permissionScope` を宣言する profile は changed-files 導出可能な runtime を要求する汎用 gate を job 生成前に置く**。scope を宣言する profile は本 request では足さない＝gate は production で inert、既存挙動は不変。

1. **request.md Meta に pipeline 選択を追加（additive・optional）**
   - `request-md.ts` / `ParsedRequest` に optional な `pipeline` フィールドを足す（値は registry の id。absent → `standard` ＝現行）。
   - `pipeline-run.ts:92` の `pipelineId: STANDARD_PIPELINE_ID` を、解決した pipelineId（`request.pipeline ?? STANDARD_PIPELINE_ID`、未知 id は `getPipelineDescriptor` の既存エラーで弾く）へ置き換える。
   - absent のとき既存と完全一致。

2. **汎用 capability gate を着手前 preflight として追加**
   - `bootstrapJob` の**前**（`validateReviewerDefinitions` と同じ前例位置）で、解決した descriptor が `permissionScope !== undefined` かつ `runtime.canDeriveChangedFiles?.() === false` なら、typed error（例 `UnsupportedRuntimeCapabilityError`）を throw して**止める。job state は一切作らない**。
   - 判定は **profile 名ではなく `permissionScope` の有無から導出**する（`pipelineId === "fast"` 等の分岐を作らない。将来の scope 宣言 profile も同じ gate を登録だけで継承する）。
   - エラー文言は「local」ではなく「**changed-files を導出できる runtime が必要**」と表現（managed が将来能力を得ても陳腐化しない）。代替（`standard` を選ぶ / scope 無し profile）を案内する。
   - `canDeriveChangedFiles?.()` が `true` または absent のときは現行どおり通過。

3. **既定挙動・registry 不変**
   - `PIPELINE_REGISTRY` に scope 宣言 profile を**足さない**（本 request では fast を入れない）。→ gate は production で発火し得ず、`pipeline` 未指定 → `standard` → 既存テストが無変更で green。
   - `standard` / `design-only` の挙動・reviewer activation は不変。

## 設計時の確認事項（非ブロッカー）

本 request の Meta `pipeline` 選択は、副作用として `design-only` も Meta から選べるようにする（従来 bootstrap は `standard` ハードコードで、`design-only` への到達は別経路だった）。これ自体は無害な新機能だが、design step で既存の design-only 起動経路との衝突を確認しておくと綺麗:

- 現状 `design-only` は専用エントリ `runDesignPipeline`（`src/core/pipeline/run.ts:137-155`）が `buildPipeline(DESIGN_ONLY_DESCRIPTOR, ...)` を直接呼ぶ経路で起動され、**pipelineId 選択（`pipeline-run.ts`）を経由していない**。
- 本 request 後は Meta `pipeline: design-only` で **2 つ目の経路**（通常の pipeline-run ＋ `getPipelineDescriptor("design-only")`）ができる。
- design で確認: (a) 両経路が job state（とくに記録される `pipelineId`）を矛盾なく作るか、(b) Meta 経由の design-only が `DESIGN_ONLY_DESCRIPTOR` に正しく到達するか、(c) `runDesignPipeline` が冗長化するなら統合 / 併存のどちらにするか。
- **本 request の blocker ではない**。衝突が見つかれば design 内で扱うか別 request に切る。少なくとも「Meta から design-only が選べてしまう」副作用が既存経路を壊さないことだけ担保する。

## スコープ外

- **`fast` descriptor ＋ permissionScope ＋ slim design** — gate を初めて意味あるものにする**最初の利用者**。別 request（`fast-pipeline`）。本 request は selection 機構と汎用 gate のみを納め、scope 宣言 profile は足さない。
- **standard へのフォールバック（D）** — 「scope 要求 → 非対応 runtime → standard 実行」は pipeline substitution ＋ requested/effective の正直記録で、**deferred の promote と同一 shape**。promote request に合流。gate は reject のみ。
- **preflight を置かず checkpoint escalation に任せる（B）** — 分かっている不適合を checkpoint まで運ぶのは無駄。#689 の checkpoint escalation は **backstop** として現状維持（本 request では変更しない）。
- **magnitude envelope / 新規トップレベル module surface / 自動昇格 / fixup 系 / managed への changed-files 能力付与 / LLM による pipeline 自動選択** — いずれも別 request。

## 受け入れ基準

- [ ] request.md Meta に optional `pipeline` が追加され、absent → `standard`（既存挙動一致）、未知 id は既存の `getPipelineDescriptor` エラーで弾かれる（test）
- [ ] `permissionScope` を持つ descriptor ＋ `canDeriveChangedFiles()===false` のとき、`bootstrapJob` 前に typed error で停止し、**job state が一切作られない**（test。実 profile がまだ無いので **test-only の fixture descriptor（permissionScope 宣言）＋ `canDeriveChangedFiles=false` の fake** で駆動する＝#688/#692 の inert 機構を fixture で検証した前例どおり）
- [ ] gate 判定が profile 名でなく `permissionScope` の有無から導出される（`pipelineId === "fast"` 等のハードコード分岐が無いことを固定）
- [ ] `canDeriveChangedFiles()===true` または absent では gate を通過する（test）
- [ ] `PIPELINE_REGISTRY` に scope 宣言 profile が増えていない → gate は production で発火せず、`pipeline` 未指定の既定経路・`standard`・`design-only`・reviewer activation が無変更（既存テスト green）
- [ ] `FindingResolution` union は `fixable | decision-needed` のまま（新 resolution 値なし）
- [ ] `bun run typecheck && bun run test` green、arch 不変条件（B-1〜B-11 ＋ DSM）green

## architect 評価済みの設計判断

- **gate は `permissionScope` の有無から導出（profile 名でハードコードしない）**: `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false` で判定。これは「scope を宣言することの性質」であって `fast` 固有でない。次の scope 宣言 profile も descriptor 登録だけで同じ gate ＋ checkpoint 防御を継承する。
- **gate は bootstrapJob 前の preflight（着手前 reject）**: `validateReviewerDefinitions` と同じ前例位置で throw。失敗 job state を残さない。「checkpoint まで走らせてから runtime 違いで escalation」はトークン・時間の無駄で、front で弾くのが正道。#689 の checkpoint escalation は front をすり抜けた時の **backstop（多層防御）** に留める。
  - **却下 D（standard フォールバック）**: substitution ＋ requested/effective の正直記録は deferred promote と同一 shape。かつ gate は local daily-driver では発火せず（`canDerive=true`）、D の便益（人間を往復させない）は managed unattended でのみ価値が出る＝現 deployment では無い。今 D を作るのは premature。promote request に合流。
  - **却下 B（checkpoint 任せ）**: 分かっている不適合を後段まで運びコストを拡散。backstop はあるが preflight 省略の理由にならない。
- **選択は request.md Meta（CLI flag / type 派生でなく）**: 「request.md が入力、PR が出力」という本ツールの思想に一致。CLI flag は将来の上乗せとして可だが初版は Meta のみ。LLM による自動選択は採らない（明示宣言のみ）。
- **inert gate は fixture で検証する**: 実 scope profile は `fast-pipeline` request まで存在しないため、本 request の gate test は test-only の permissionScope 宣言 descriptor で駆動する（#688/#692 と同型）。
- **依存**: #692（`canDeriveChangedFiles` / `RealRuntimeStrategy`）＋ #689（`permissionScope`）。両者マージ済み。**後続**: `fast-pipeline`（本 gate と selection 機構の最初の利用者）。
