# pipeline を request.md Meta で選択可能にし、scope を強制できない runtime を着手前に拒否する汎用 capability gate を置く

**Date**: 2026-06-14
**Status**: accepted
**Related**:
- `specrunner/adr/2026-06-14-pipeline-scope-declaration-machine-escalation.md`（permissionScope 宣言基盤）
- `specrunner/adr/2026-06-14-scope-unevaluable-fail-closed.md`（canDeriveChangedFiles / RealRuntimeStrategy）
- `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor / PIPELINE_REGISTRY）
- `specrunner/adr/2026-06-01-dsm-closure-src-wide.md`（DSM / parser → core/pipeline 非依存）

## Context

#689（scope 宣言＋超過の機械導出）と #692（評価不能 runtime の fail-closed）で scope 機構の土台は揃った。しかしこの機構には 2 つの構造的な穴があった。

1. **pipeline を front で選択する機構が無い。** job 生成時 `pipelineId` は `STANDARD_PIPELINE_ID` にハードコード（`src/core/command/pipeline-run.ts`）。request.md Meta は `type/slug/base-branch/adr` を解析するが `pipeline` フィールドが存在しない。`permissionScope` を宣言する profile を将来 registry に追加しても、request 単位で pipeline を選ぶ手段が無い。

2. **`permissionScope` を宣言する profile は changed-files を導出できる runtime を要求するが、着手前にそれを検証して拒否する gate が無い。** bootstrap 直前には「検査して throw＝状態を作らない」前例がある（`validateReviewerDefinitions` が `bootstrapJob` の前で throw）が、runtime の capability と descriptor の要求の照合は行われていない。分かっている不適合を checkpoint（後段）まで運ぶと、トークン・時間を消費してから escalation になる。

本変更は **挙動中立の土台 infra** として、上記 2 つの穴を埋める:
- **(a) request.md Meta で pipeline を選択できるようにする**（additive・optional）。
- **(b) `permissionScope` を宣言する profile は changed-files を導出できる runtime を要求する、という汎用 capability gate を着手前（job 生成前）に置く**。

scope を宣言する profile は本変更では足さない（最初の利用者は後続の `fast-pipeline` request）。gate は production で発火せず、`pipeline` 未指定なら従来どおり `standard`—「選択できるようになったが既存挙動は完全に不変」。

## Decision

### D1: pipeline 選択は request.md Meta（optional `pipeline` フィールド）。parser は抽出のみ

`ParsedRequestRaw` / `ParsedRequest` に optional `pipeline?: string` を追加し、`parseRequestMdRaw` で Meta 行 `- **pipeline**: <id>` を抽出する。`issue` フィールドと同型で **validation rule は足さない**（parser 層は registry を知らない＝知ってはならない）。値の妥当性（既知 id か）は下流の `getPipelineDescriptor` が担う。

`pipeline-run.ts` の `pipelineId: STANDARD_PIPELINE_ID` を `request.pipeline ?? STANDARD_PIPELINE_ID` へ置き換える。未知 id は `getPipelineDescriptor`（既知 id 一覧付きで throw）が `bootstrapJob` 前に弾く。

**Rationale**: 「request.md が入力、PR が出力」という本ツールの思想に一致する。parser 層（`src/parser`）が `src/core/pipeline` の registry を import すると逆向き依存（kernel/parser → domain）になり DSM を壊す。`issue` の前例（optional・抽出のみ・rule 無し）に倣い、バリデーションを `getPipelineDescriptor` の一点に集約する。

### D2: gate は `permissionScope` の有無から導出する純関数（profile 名でハードコードしない）

判定は `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false`。この判定を純関数 `assertRuntimeSupportsScope(descriptor, runtime)` として新モジュール `src/core/pipeline/runtime-capability-gate.ts`（domain）に置き、`pipeline-run.ts`（command）から呼ぶ。引数 `runtime` は `Pick<RuntimeStrategy, "canDeriveChangedFiles">` で受ける。

**Rationale**: 「scope を宣言することの性質」を表現する。`pipelineId === "fast"` のような分岐を作ると、次の scope 宣言 profile ごとに gate を増改築する羽目になる。`permissionScope` の有無で導出すれば、将来の profile は descriptor 登録だけで gate（＋ #689 checkpoint 防御）を継承する。`canDeriveChangedFiles?.()` の optional chaining により、predicate 未実装（absent）の fake は `undefined === false` が偽となりフォールスルーする（#692 の seam 契約と一致）。純関数なので fs/child_process/env/SDK に触れず B 系不変条件に抵触しない。

### D3: gate は `bootstrapJob` 前の preflight（着手前 reject）。失敗 job state を残さない

`assertRuntimeSupportsScope` は `pipeline-run.ts` の `prepare()` 内、`validateReviewerDefinitions` と同じ前例位置（`bootstrapJob` の直前）で呼ぶ。違反時は typed error を throw し、`bootstrapJob`（jobId 採番・初期 JobState 構築）に到達しない＝**job state を一切作らない**。

**Rationale**: 分かっている不適合を checkpoint（後段）まで運ぶのはトークン・時間の無駄で、front で弾くのが正道。失敗 job state を残さないことで再開・archive の対象が汚れない。#689 の checkpoint escalation は front をすり抜けた時の backstop（多層防御）として現状維持する。

### D4: typed error は専用クラス `UnsupportedRuntimeCapabilityError`、文言は runtime 能力で表現

新モジュールに `UnsupportedRuntimeCapabilityError extends Error`（`name` を設定、`pipelineId` を保持）を定義し、gate 違反時に throw する。`ReviewerValidationError`（同じ bootstrap 前 throw の前例）に倣う。message は **「local」とは書かず**「選択された pipeline `<id>` は permissionScope を宣言しており、changed-files を導出できる runtime が必要だが、現在の runtime はそれを満たさない」と表現し、代替（`standard` を選ぶ / permissionScope を宣言しない profile を選ぶ / changed-files を導出できる runtime で実行する）を案内する。

**Rationale**: 「changed-files を導出できる runtime が必要」と能力で表現すれば、managed が将来その能力を得ても文言が陳腐化しない。専用クラスで `toThrow(UnsupportedRuntimeCapabilityError)` による型固定 test が書ける。

### D5: registry 不変、gate は production で inert。検証は fixture で駆動

`PIPELINE_REGISTRY` に scope 宣言 profile を**足さない**。実 scope profile は `fast-pipeline` request まで存在しないため、gate test は **test-only の fixture descriptor（permissionScope 宣言）＋ `canDeriveChangedFiles=false` の fake** で駆動する（#688/#692 で inert 機構を fixture 検証した前例どおり）。

gate 純関数（D2）は fixture descriptor を直接渡して throw/pass を単体検証する。「`bootstrapJob` 前で止まり state を作らない」の結合検証は test スコープで registry に fixture descriptor を一時挿入（`beforeEach` 追加 / `afterEach` 削除）し、`bootstrapJob` spy が未呼び出しであることを assert する。production の `PIPELINE_REGISTRY` 初期化子は無改変。

### D6: Meta 経由 design-only は通常経路に到達。`runDesignPipeline` とは併存

本変更後、Meta `pipeline: design-only` は `pipelineId = "design-only"` を `bootstrapJob` に渡し、通常経路（`buildPipelineForJob`/`runPipeline` → `getPipelineDescriptor("design-only")` → `DESIGN_ONLY_DESCRIPTOR`）で起動する。これが production で `DESIGN_ONLY_DESCRIPTOR` に到達する初の経路になる。

`runDesignPipeline`（`src/core/pipeline/run.ts`）は production の呼び出し元が無い（test-only/dead path）ため、production 上で 2 経路が同時に走って矛盾する状況は発生しない。`DESIGN_ONLY_DESCRIPTOR` は `permissionScope` を持たない＝gate inert で無害。削除・統合は本変更の additive infra の範囲を超えるため、dead path の扱いは別 request の候補に委ねる。

## Alternatives Considered

### A1: parser に `pipeline-known` validation rule を追加して parse 時に弾く

- **Pros**: エラーを最上流に寄せられる
- **Cons**: parser → registry の逆依存（`src/parser` が `src/core/pipeline` を import）を生み DSM を壊す。妥当性検証は registry の責務であり、二重化は無駄
- **Why not**: 却下。`getPipelineDescriptor` の一点集約を維持する（D1）

### A2: pipeline を CLI flag（`--pipeline`）で選択する

- **Pros**: request.md を書き換えずに pipeline を切り替えられる
- **Cons**: 「request.md が入力、PR が出力」の思想から外れる
- **Why not**: 初版は Meta 一本に集約する。将来の上乗せとして可

### A3: gate を profile 名（`pipelineId === "fast"` 等）でハードコードする

- **Pros**: 実装が直接的
- **Cons**: 次の scope 宣言 profile ごとに gate を触る負債。受け入れ基準で明示的に禁止
- **Why not**: 却下。`permissionScope` の有無から導出する（D2）

### A4: gate ロジックを `pipeline-run.ts` にインラインで書く

- **Pros**: ファイルが増えない
- **Cons**: fixture descriptor での単体検証がしづらく、call-site 結合テストでしか駆動できなくなる
- **Why not**: 却下。純関数に切り出して独立検証する（D2）

### A5: gate を置かず checkpoint escalation に任せる（#689 の backstop のみ）

- **Pros**: 実装コストゼロ
- **Cons**: 分かっている不適合を後段まで運びトークン・時間を拡散する。backstop はあるが preflight 省略の理由にならない
- **Why not**: 却下。backstop は front をすり抜けた時の多層防御に留める（D3）

### A6: 非対応 runtime で scope 宣言 profile を使った場合に `standard` へフォールバックする

- **Pros**: managed unattended での往復を減らせる
- **Cons**: substitution ＋ requested/effective の正直記録は deferred promote と同一 shape。local daily-driver では gate が発火せず（`canDerive=true`）D の便益は managed unattended でのみ価値が出る＝現 deployment に無い。今作るのは premature
- **Why not**: 却下。promote request に合流する。gate は reject のみ（D3）

### A7: gate を `scope.ts` に同居させる

- **Pros**: ファイルが増えない
- **Cons**: `scope.ts` は finding 合成の純モジュールで関心が違う。capability gate は別ファイルに分けて独立検証する
- **Why not**: 却下。`runtime-capability-gate.ts` として分離する（D2）

## Consequences

### Positive

- 将来の scope 宣言 profile（例: `fast`）は `permissionScope` を descriptor に宣言するだけで、着手前 capability gate（＋ #689 checkpoint 防御）を自動的に継承する。gate を追加実装する必要が無い。
- parser 層が registry を import しない DSM 制約が構造的に維持される。
- gate は production で発火せず、既存テスト・挙動が完全無変更のまま。`standard`/`design-only`/reviewer activation は現行と一致する。
- `bootstrapJob` 前に throw するため、失敗 job state が state file / worktree に一切残らない。
- test は純関数（gate）と call-site 結合（bootstrapJob spy）の 2 層で境界を明確に固定できる。

### Negative / Known Debt

- `runDesignPipeline`（test-only/dead path）が `Meta: design-only` という 2 つ目の経路と併存する。将来の混乱源にならないよう、production dead であることを test で固定した上で統合は別 request に明示的に切り出す（D6）。
- `pipeline` 値のタイポ・空文字は `getPipelineDescriptor` のエラーで bootstrap 前に弾かれるが、エラーが registry の詳細（既知 id 一覧）を expose する。許容範囲内。
- standard フォールバック（A6）は現時点で未実装。managed unattended での往復回避が必要になった時点で promote request に合流させる。

## References

- Request: `specrunner/changes/pipeline-selection-capability-gate/request.md`
- Design: `specrunner/changes/pipeline-selection-capability-gate/design.md`
- Spec: `specrunner/changes/pipeline-selection-capability-gate/spec.md`
