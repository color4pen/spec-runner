# Design: pipeline を request.md で選択可能にし、scope を強制できない runtime を着手前に拒否する汎用 gate を入れる

## Context

scope 機構は 2 段で揃っている（両者マージ済み）:

- #689（scope-exceeded-escalation）: `PipelineDescriptor.permissionScope`（`src/core/pipeline/types.ts`）を宣言した profile について、checkpoint judge step で changed-files を禁止面に突合し、超過を `decision-needed` finding として escalation に載せる。
- #692（scope-unevaluable-fail-closed）: changed-files を機械導出できない runtime（managed）では scope を fail-closed に escalation する。`RuntimeStrategy.canDeriveChangedFiles?()`（`src/core/port/runtime-strategy.ts`）が seam メタ情報。local→`true` / managed→`false`、test fake では optional（absent）。

しかしこの土台には 2 つの穴がある（コードを読んで検証済み、以下は現状の前提）:

1. **pipeline を front で選択する機構が無い。** job 生成時、`pipelineId` は `STANDARD_PIPELINE_ID` にハードコードされている（`src/core/command/pipeline-run.ts:92`）。projection 解決 `getPipelineId`（`src/state/pipeline-id.ts:20`）は absent→`standard` fallback。`PIPELINE_REGISTRY`（`src/core/pipeline/registry.ts:107`）には `standard` と `design-only` の 2 本のみ。
2. **`permissionScope` を宣言する profile がまだ無い。** つまり #689/#692 の機構は現状 inert（production で発火しない）。

加えて、#692 で「評価不能 runtime は fail-closed」は checkpoint step（後段）で守られているが、**着手前（job 生成前）に「この runtime ではこの profile を実行できない」と分かっている場合に front で弾く gate は無い**。`bootstrapJob` の直前には「検査して throw＝状態を作らない」前例がある: `validateReviewerDefinitions(reviewerDefs)` が `bootstrapJob` の前で throw する（`pipeline-run.ts:71-79`、コメント「Load and validate ... BEFORE bootstrapping job」）。`runtime` はコンストラクタ依存なので bootstrap 前に `canDeriveChangedFiles()` を呼べる。

本 request は **挙動中立の土台 infra** を 2 つ入れる:

- (a) request.md Meta で pipeline を選択できるようにする（additive・optional）。
- (b) `permissionScope` を宣言する profile は changed-files を導出できる runtime を要求する、という**汎用 capability gate** を着手前 preflight として置く。

これは「scope を宣言することの性質」であって特定 profile の性質ではない。最初の利用者（軽量 `fast` pipeline）は別 request（`fast-pipeline`）で追加する。本 request 単体では scope を宣言する profile を **1 つも足さない**ため、gate は production で発火せず、`pipeline` 未指定なら従来どおり `standard`。つまり「**選択できるようになったが既存挙動は完全に不変**」。

### 検証済みの現状（main の前提）

- request.md Meta は `src/parser/request-md.ts` の `parseRequestMdRaw` が `type/slug/base-branch/adr/issue` を抽出し、`parseRequestMdContent` が `ParsedRequest` を組む。`issue` は **optional・抽出のみ・validation rule 無し**（`src/parser/rules/index.ts` に rule 登録なし）。`pipeline` フィールドは現状無い（grep 0 件）。
- `getPipelineDescriptor`（`registry.ts:116`）は未知 id を、既知 id 一覧付きで throw する。
- `runDesignPipeline`（`src/core/pipeline/run.ts:149`）は `DESIGN_ONLY_DESCRIPTOR` を直接 build する経路だが、**production の呼び出し元が無い**（`tests/pipeline.test.ts` のみが直接 import）。通常の job 実行は `CommandRunner` → `buildPipelineForJob`/`runPipeline`（`run.ts:86,124`）が `getPipelineId(jobState)` → `getPipelineDescriptor` で descriptor を解決する。したがって `jobState.pipelineId === "design-only"` なら通常経路でも `DESIGN_ONLY_DESCRIPTOR` に到達する。
- CLI の run command（`src/cli/run.ts:100-102`）は command 段の throw を `logError(message); return 1` で握る（`exitCode`/`hint` は参照しない）。`validateReviewerDefinitions` の `ReviewerValidationError` も同経路で表面化する。

## Goals / Non-Goals

**Goals**:

- request.md Meta に optional `pipeline` を追加し、registry の id で pipeline を選択できる。absent → `standard`（既存挙動完全一致）。未知 id は既存の `getPipelineDescriptor` エラーで弾く。
- `permissionScope` を宣言する descriptor を、changed-files を導出できない runtime（`canDeriveChangedFiles?.() === false`）で実行しようとしたら、`bootstrapJob` の**前**に typed error で停止し、**job state を一切作らない**。
- gate 判定は **`permissionScope` の有無から導出**し、profile 名でハードコード分岐しない。将来の scope 宣言 profile は descriptor 登録だけで同じ gate を継承する。
- 本 request では scope 宣言 profile を registry に足さない → gate は production で inert、既存挙動（`standard`/`design-only`/reviewer activation）は無変更。

**Non-Goals**:

- `fast` descriptor ＋ permissionScope ＋ slim design（gate の最初の利用者）— 別 request `fast-pipeline`。
- standard へのフォールバック（scope 要求 → 非対応 runtime → standard 実行）— substitution ＋ requested/effective 記録は deferred promote と同一 shape。gate は reject のみ。promote request に合流。
- preflight を置かず checkpoint escalation に任せる案 — #689 の checkpoint escalation は backstop として現状維持（本 request では変更しない）。
- CLI flag / config 既定 pipeline / type 派生選択 / LLM による自動選択 — いずれも将来の上乗せ。初版は Meta による明示宣言のみ。
- managed への changed-files 能力付与 / `FindingResolution` への新 resolution 値追加 / 新規トップレベル module surface。
- `runDesignPipeline`（test-only/dead path）の削除・統合 — Meta 経路と併存させる（後述 D6）。

## Decisions

### D1: pipeline 選択は request.md Meta（additive・optional `pipeline`）。parser は抽出のみ

`ParsedRequestRaw` / `ParsedRequest` に optional `pipeline?: string` を追加し、`parseRequestMdRaw` で Meta 行 `- **pipeline**: <id>` を抽出する。`issue` と同型で **validation rule は足さない**（parser 層は registry を知らない＝知ってはならない）。値の妥当性（既知 id か）は下流の `getPipelineDescriptor` が担う。

**Rationale**: 「request.md が入力、PR が出力」という本ツールの思想に一致する。parser 層（`src/parser`）が `src/core/pipeline` の registry を import すると逆向き依存（kernel/parser → domain）になり DSM を壊す。`issue` の前例（optional・抽出のみ・rule 無し）にそのまま倣えば、未知/空値は `getPipelineDescriptor` の既存エラー（既知 id 一覧付き）で一点に集約され、エラー経路が増えない。

**Alternatives considered**:
- parser に `pipeline-known` rule を足して parse 時に弾く → 却下。parser → registry の逆依存を生む。妥当性検証は registry の責務で、二重化は無駄。
- CLI flag（`--pipeline`）で選択 → 却下（初版）。Meta 一本に集約する方が「入力は request.md」の思想に忠実。flag は将来の上乗せとして可。

### D2: gate は `permissionScope` の有無から導出する純関数（profile 名でハードコードしない）

判定は `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false`。この判定を純関数 `assertRuntimeSupportsScope(descriptor, runtime)` として新モジュール `src/core/pipeline/runtime-capability-gate.ts`（domain）に置き、`pipeline-run.ts`（command）から呼ぶ。引数 `runtime` は `Pick<RuntimeStrategy, "canDeriveChangedFiles">` で受け、テスト fake を最小化する。

**Rationale**: 「scope を宣言することの性質」を表現する。`pipelineId === "fast"` のような分岐を作ると、次の scope 宣言 profile ごとに gate を増改築する羽目になる。`permissionScope` の有無で導出すれば、将来の profile は descriptor 登録だけで gate（＋ #689 checkpoint 防御）を継承する。`canDeriveChangedFiles?.()` の optional chaining により、predicate 未実装（absent）の fake は `undefined === false` で偽となりフォールスルーする（#692 の seam 契約と一致）。配置は domain（`core/pipeline`）で、`RuntimeStrategy` 型を `core/port` から import する既存の許可 edge（`run.ts` / `reviewer-chain.ts` に前例）に乗るため DSM 不変。純関数なので fs/child_process/env/SDK に触れず B 系不変条件に抵触しない。

**Alternatives considered**:
- `pipelineId`/profile 名で分岐 → 却下。受け入れ基準で明示的に禁止。拡張のたびに gate を触る負債になる。
- gate ロジックを `pipeline-run.ts` にインライン → 却下。fixture descriptor での単体検証（#688/#692 の前例）がしづらく、call-site 結合テストでしか駆動できなくなる。純関数に切り出して独立検証する。
- `scope.ts` に同居 → 却下。`scope.ts` は finding 合成の純モジュールで関心が違う。capability gate は別ファイルに分ける。

### D3: gate は `bootstrapJob` 前の preflight（着手前 reject）

`assertRuntimeSupportsScope` は `pipeline-run.ts` の `prepare()` 内、`validateReviewerDefinitions` と同じ前例位置（`bootstrapJob` の直前）で呼ぶ。違反時は typed error を throw し、`bootstrapJob`（jobId 採番・初期 JobState 構築）に到達しない＝**job state を一切作らない**。`bootstrapJob` 自体は in-memory（永続化は `setupWorkspace` に遅延）なので、その前で throw すれば state file も worktree も生まれない。

**Rationale**: 分かっている不適合を checkpoint（後段）まで運ぶのはトークン・時間の無駄で、front で弾くのが正道。失敗 job state を残さないことで再開・archive の対象が汚れない。

**Alternatives considered**:
- **却下 D（standard フォールバック）**: 「scope 要求 → 非対応 runtime → standard 実行」は substitution ＋ requested/effective の正直記録で、deferred promote と同一 shape。かつ gate は local daily-driver では発火せず（`canDerive=true`）、D の便益（人間を往復させない）は managed unattended でのみ価値が出る＝現 deployment では無い。今 D を作るのは premature。promote request に合流。
- **却下 B（checkpoint 任せ）**: 分かっている不適合を後段まで運びコストを拡散する。#689 の checkpoint escalation は front をすり抜けた時の backstop（多層防御）として現状維持し、preflight 省略の理由にはしない。

### D4: typed error は専用クラス `UnsupportedRuntimeCapabilityError`、文言は runtime 能力で表現

新モジュールに `UnsupportedRuntimeCapabilityError extends Error`（`name` を設定、`pipelineId` を保持）を定義し、gate 違反時に throw する。`ReviewerValidationError`（`src/core/reviewers/types.ts:67`、同じ bootstrap 前 throw の前例）に倣う。message は **「local」とは書かず**「選択された pipeline `<id>` は permissionScope を宣言しており、changed-files を導出できる runtime が必要だが、現在の runtime はそれを満たさない」と表現し、代替（`standard` を選ぶ / permissionScope を宣言しない profile を選ぶ / changed-files を導出できる runtime で実行する）を案内する。

**Rationale**: 「changed-files を導出できる runtime が必要」と能力で表現すれば、managed が将来その能力を得ても文言が陳腐化しない。専用クラスにすることで test が `toThrow(UnsupportedRuntimeCapabilityError)` で型を固定でき、`ReviewerValidationError` と同じ「prepare() 内 throw → CLI が message を表示」の経路に自然に乗る。

**Alternatives considered**:
- `SpecRunnerError` ＋ 新 `ERROR_CODES` エントリ → 候補。`exitCode`/`hint` を持てる利点はあるが、CLI の command 段 catch（`run.ts:100-102`）は `message` のみ表示し `exitCode`/`hint` を参照しないため、現状の表面化では差が出ない。bootstrap 前 throw の最も近い前例（`ReviewerValidationError`）が専用クラスなので、それに揃える。

### D5: registry 不変 → gate は production で inert、検証は fixture で駆動

`PIPELINE_REGISTRY` に scope 宣言 profile を**足さない**。実 scope profile は `fast-pipeline` request まで存在しないので、本 request の gate test は **test-only の fixture descriptor（permissionScope 宣言）＋ `canDeriveChangedFiles=false` の fake** で駆動する（#688/#692 で inert 機構を fixture 検証した前例どおり）。

gate 純関数（D2）は fixture descriptor を直接渡して throw/pass を単体検証する。「`bootstrapJob` 前で止まり state を作らない」の結合検証は、`prepare()` 内の call-site 順序を駆動するため、**test スコープで一時的に** registry に fixture descriptor を挿入（`beforeEach` で追加／`afterEach` で削除）し、`request.pipeline` をその fixture id にして `bootstrapJob` spy が未呼び出しであることを assert する。production の `PIPELINE_REGISTRY` 初期化子は無改変（受け入れ基準「scope 宣言 profile が増えていない」を満たす＝コミットされる registry の話であり、test 実行時の一時 fixture とは別）。

**Rationale**: 機構（selection ＋ gate）と最初の利用者（`fast`）を分離することで、本 request を完全に挙動中立に保てる。fixture 検証は既存 2 request で確立した型。

**Alternatives considered**:
- gate test のために `fast` 相当の scope profile を registry に入れる → 却下。production で gate が発火し得る状態になり「既存挙動完全一致」を崩す。スコープ外。

### D6: Meta 経由 design-only は通常経路に到達。`runDesignPipeline` とは併存

本 request 後、Meta `pipeline: design-only` は `pipelineId = "design-only"` を `bootstrapJob` に渡し、通常経路（`buildPipelineForJob`/`runPipeline` → `getPipelineDescriptor("design-only")` → `DESIGN_ONLY_DESCRIPTOR`）で起動する。これが production で `DESIGN_ONLY_DESCRIPTOR` に到達する初の経路になる。

設計時の確認事項（非ブロッカー、検証済み）への結論:
- (a) job state の整合: Meta 経路は `pipelineId = "design-only"` を正しく記録する。`runDesignPipeline` は `pipelineId` を set しない関数だが、**production の呼び出し元が無い**（test-only）ため、production 上で 2 経路が同時に走って矛盾する状況は発生しない。
- (b) 到達性: `getPipelineId(jobState) === "design-only"` → `getPipelineDescriptor` → `DESIGN_ONLY_DESCRIPTOR`。読解で確認済み、test で固定する。
- (c) 統合 vs 併存: `runDesignPipeline` は test-only/dead であり、削除・統合は本 request の additive infra の範囲を超える（既存 test への波及・コード変更）。**併存**とし、削除は別 request の候補に回す。本 request では「Meta から design-only が選べてしまう副作用が既存経路を壊さない」ことだけを担保する（`DESIGN_ONLY_DESCRIPTOR` は permissionScope を持たない＝gate inert なので無害）。

**Rationale**: スコープを「selection 機構＋汎用 gate」に絞り、dead path のリファクタを混ぜない。副作用は無害であることを test で固定するに留める。

## Risks / Trade-offs

- [test での registry 一時 mutation がリークし他 test を汚染する] → `beforeEach` 追加 / `afterEach` 削除で対称化し、fixture id は衝突しないユニーク名にする。gate 純関数テスト（fixture descriptor 直渡し）を主とし、registry mutation は call-site 順序検証の最小限に留める。
- [Meta 経由 design-only という 2 経路目が将来の混乱源になる] → `runDesignPipeline` が production dead であることを前提に併存。Meta 経路の到達性と無害性を test で固定し、統合は別 request に明示的に切り出す（D6）。
- [`pipeline` 値のタイポ／空文字] → `getPipelineDescriptor` が既知 id 一覧付きで throw（`prepare()` 内、bootstrap 前）。job state は作られない。利用者は一覧を見て修正できる。
- [gate 文言に runtime 種別名（local/managed）を埋め込むと将来陳腐化] → D4 のとおり能力（changed-files 導出可否）で表現し、種別名を避ける。
- [predicate absent の fake が誤って gate を発火させる] → `=== false` の厳密比較＋ optional chaining で、absent（`undefined`）・`true` はフォールスルー。#692 の seam 契約に一致し、test で固定する。

## Open Questions

- なし（設計分岐は D1–D6 で確定。`fast` profile・CLI flag・standard フォールバックはいずれも明示的にスコープ外＝別 request）。
