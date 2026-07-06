# fast pipeline の forbidden surfaces をハードコードから repo config data に移す

**Date**: 2026-07-06
**Status**: accepted
**Related**:
- `specrunner/adr/2026-06-14-fast-pipeline-profile.md`（fast pipeline 追加 / D2 で 3 面をハードコードした経緯）
- `specrunner/adr/2026-06-14-pipeline-scope-declaration-machine-escalation.md`（permissionScope / scope-check / checkpoint 機構の土台）
- `specrunner/adr/2026-06-14-pipeline-selection-capability-gate.md`（assertRuntimeSupportsScope / capability gate）
- `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor / PIPELINE_REGISTRY）
- `specrunner/adr/2026-05-26-project-config-overlay.md`（project local config / deep-merge 規則）

## Context

`2026-06-14-fast-pipeline-profile.md` の D2 で、`FAST_DESCRIPTOR.permissionScope.forbidden` に 3 面をリテラルで宣言した:

```typescript
forbidden: [
  { id: "public-types",      paths: ["src/core/port/**"] },
  { id: "persisted-format",  paths: ["src/state/schema.ts"] },
  { id: "state-transitions", paths: ["src/state/lifecycle.ts"] },
]
```

これらのパスは spec-runner 自身の repo 構造に固有の値である。製品コード（全 repo に配布される registry 定数）に dogfooding 設定が漏れた状態になっており、他の repo で fast を選んだとき存在しないパスに対する無意味な scope 宣言が適用される。

`archive.protectedPaths` が同じ問題を「glob リストは repo config が持つ data」として整理済みである。本変更はこの整理を forbidden surfaces に適用し、「**pipeline の形（steps / transitions / checkpoint 位置）は code、保護対象（どのパスが契約面か）は repo が持つ data**」という原則を一貫させる。

## Decision

### D1: forbidden surfaces を config data として持ち、registry のリテラルを撤去する

`FAST_DESCRIPTOR.permissionScope.forbidden` を `[]`（空配列）に変える。`checkpoint: "conformance"` の presence は維持する。3 面リテラルは registry から削除し、保護対象パスは repo が持つ data として `.specrunner/config.json` へ移す。

**無指定 → forbidden は空**（空の forbidden は breach ゼロ）。この選択により、fast を新規採用した repo は明示宣言するまで scope 保護ゼロになるが、これは意図した挙動——「保護対象は repo が宣言する data」。

- **Rationale**: 無指定でもコード側の 3 面が効き続けると spec-runner 固有パスが全 repo の既定として出荷され続ける。「data は repo が持つ」——`archive.protectedPaths` と同じ整理。
- **却下した代替案**: 現行 3 面をコード既定として維持し config で上書き可能にする → 「無指定でも spec-runner のパスが全 repo に効く」状態が残り、本変更の動機が解消しない。

### D2: config キーは `pipeline.fast.forbiddenSurfaces`

既存 `pipeline` セクション（`maxRetries` を持つ）配下に `fast.forbiddenSurfaces` を追加する。要素は `{ id: string; paths: string[] }`。

```jsonc
{
  "pipeline": {
    "fast": {
      "forbiddenSurfaces": [
        { "id": "public-types",      "paths": ["src/core/port/**"] },
        { "id": "persisted-format",  "paths": ["src/state/schema.ts"] },
        { "id": "state-transitions", "paths": ["src/state/lifecycle.ts"] }
      ]
    }
  }
}
```

- **Rationale**: profile 名（`fast`）で namespace することで、将来 scope を宣言する別 profile が `pipeline.<id>.forbiddenSurfaces` パターンで自然に拡張できる。既存 `pipeline` セクション配下に収め、config の階層深化を最小化する。
- **却下した代替案**: top-level `forbiddenSurfaces` → どの profile の scope かが表現できない。`permissionScope` を丸ごと config 化（checkpoint 含む）→ D3 で却下。

### D3: checkpoint は config 化しない（shape is code, data is repo）

config が開放するのは `forbidden`（保護対象パス = data）のみ。`checkpoint`（= conformance、検査点）は registry の code に残す。

- **Rationale**: 検査点は pipeline 形状の一部。「shape is code」原則に従う。config 化するのは保護対象という data だけ。
- **却下した代替案**: `permissionScope` 全体を config 化 → checkpoint を任意 step に指定可能にすると非 judge step を checkpoint に設定するなど不整合な設定を許し、pipeline 形状が config に漏れる。

### D4: 注入は descriptor 解決時の変換で行う（registry は純粋定数のまま）

新しい純関数 `applyScopeConfig(base: PipelineDescriptor, config): PipelineDescriptor` を `src/core/pipeline/resolve-scope.ts` に置く。`composeReviewerDescriptor` と同型の「base descriptor + config → 実効 descriptor」変換:

- `base.permissionScope` が不在（standard / design-only）→ `base` を参照同一で返す（zero-overhead 不変）。
- 存在するとき → `{ ...base, permissionScope: { checkpoint: base.permissionScope.checkpoint, forbidden: <config 解決値> } }` を返す。

config 解決は named resolver `resolvePipelineForbiddenSurfaces(config, pipelineId)` に委譲する（`resolveArchiveConfig` と同じ場所・同じ責務）。`pipelineId === "fast"` → `config.pipeline?.fast?.forbiddenSurfaces ?? []`。id → config 位置のマッピングはこの resolver 1 箇所に閉じる。

import 方向は config → core（`resolvePipelineForbiddenSurfaces` が `{ id: string; paths: string[] }` を返し、core 層の `ForbiddenSurface`（`paths: readonly string[]`）と構造的代入互換）。config → core の上向き import は発生しない。

- **Rationale**: registry がグローバル config を読むと module 定数の純粋性が壊れ、テストが config 状態に依存する。変換を descriptor 解決時に置くことで registry は純粋定数のまま、消費側（`scope.ts` / capability-gate / executor）は descriptor 経由で値を受ける現行構造を保てる（消費側コードは変更不要）。
- **却下した代替案**: registry がグローバル config を読む → 上記。各消費側が個別に config を読む → scope の値が複数箇所に散り、descriptor が単一の真実でなくなる。

### D5: 変換の配線位置は runtime descriptor 解決の 2 箇所。preflight gate は presence 維持で不変

runtime で descriptor を解決するのは `run.ts` の `buildPipelineForJob` と `runPipeline` の 2 箇所（いずれも `getPipelineDescriptor` → `composeReviewerDescriptor`）。この間に `applyScopeConfig(base, deps.config)` を挿入し、`composeReviewerDescriptor(scoped, jobState.reviewers)` へ渡す。変換順序は scope 解決が先（`composeReviewerDescriptor` は `...scoped` で permissionScope を保持するため reviewer 有無に関係なく解決済み scope が保たれる）。

preflight（`pipeline-run.ts` の capability gate）は変更しない: `assertRuntimeSupportsScope` は `descriptor.permissionScope` の **presence** のみを読み、presence は registry 定数（forbidden 空でも `permissionScope` 自体は存在）で保たれるため、config の有無に関わらず gate は現行どおり発火する。

- **Rationale**: gate は presence 判定。forbidden の中身は gate の判定に関与しない。preflight を触らないことで変更面を最小化し、「機構は一様、data のみ可変」を保つ。

### D6: dogfooding config の移設は本 PR 内で原子的に行う

registry からリテラルを外す変更（無指定 → 空）と、spec-runner 自身の `.specrunner/config.json` への 3 面追加を **同一 PR** で行う。

- **Rationale**: 保護の連続性。registry 撤去だけが先行すると spec-runner 自身の dogfooding 保護が一時的に切れる。
- **却下した代替案**: 段階リリース → 中間状態で保護が切れる。

## Alternatives Considered

### A1: 現行 3 面をコード既定として維持し config で上書き可能にする

- **Pros**: 既存保護がデフォルトで維持される
- **Cons**: 「無指定でも spec-runner のパスが全 repo に効く」状態が残り、本変更の動機（製品コードへの dogfooding 設定漏れ）が解消しない
- **Why not**: 却下

### A2: `permissionScope` 全体（checkpoint 含む）を config 化する

- **Pros**: pipeline scope 設定を完全に repo 側で制御できる
- **Cons**: checkpoint を任意の step に指定可能にすると pipeline 形状が config に漏れる。非 judge step を checkpoint に設定するなど不整合な設定を許してしまう
- **Why not**: 却下。保護対象（data）のみを config 化し、検査点（shape）は code に残す（D3）

### A3: registry がグローバル config を読む

- **Pros**: 変換関数の追加が不要で実装がシンプル
- **Cons**: module 定数の純粋性が壊れ、テストが config 状態に依存する。静的 import によりモジュール初期化時に config 読み込みが走る副作用が生じる
- **Why not**: 却下（D4）

### A4: 各消費側（scope.ts / capability-gate / executor）が個別に config を読む

- **Pros**: 各消費側が自律的に最新 config を参照できる
- **Cons**: scope の値が複数箇所に散り、descriptor が scope の単一の真実でなくなる。変換点が複数箇所に生まれる
- **Why not**: 却下（D4）

### A5: preflight（着手前）でも `applyScopeConfig` を適用する

- **Pros**: preflight 時点で実効 forbidden が解決済みになる
- **Cons**: preflight の capability gate は `permissionScope` の presence のみを読み、forbidden の中身を参照しない。適用しても現行挙動は変わらず、変更面を広げるだけになる
- **Why not**: 不要。preflight が forbidden を参照するようになった場合に再検討する

## Consequences

### Positive

- `FAST_DESCRIPTOR.permissionScope.forbidden` から spec-runner 固有のパスリテラルが消え、製品コードへの dogfooding 設定漏れが解消する。他の repo で fast を選んでも無意味な scope 宣言が適用されない。
- `archive.protectedPaths` と同じ「data は repo が持つ」整理が forbidden surfaces にも適用され、原則が一貫する。
- `applyScopeConfig` は `composeReviewerDescriptor` と同型の変換関数として descriptor 解決パイプラインに収まり、消費側（scope.ts / capability-gate / executor）は変更不要。
- capability gate（`assertRuntimeSupportsScope`）は presence 判定であり、config の有無に関わらず fast に引き続き適用される（「機構は一様、data のみ可変」の維持）。

### Negative / Known Debt

- **無指定 → 空**により、fast を新規採用した repo は明示宣言するまで scope breach 保護ゼロになる。これは意図した挙動だが、capability gate による「導出不能 runtime での fast 拒否」という別レイヤの保証は残る。docs に手順を記載して周知する。
- deep-merge の array 置換規則（project local が user global を丸ごと置換）を知らないと、user/project 両方で宣言したとき片方が消える。docs に明記して対処する。
- 将来 preflight が forbidden の中身を参照するようになった場合、preflight にも `applyScopeConfig` を適用する必要が生じる（現状は gate は presence のみで足りるため未対応）。

## References

- Request: `specrunner/changes/fast-scope-config/request.md`
- Design: `specrunner/changes/fast-scope-config/design.md`
- Spec: `specrunner/changes/fast-scope-config/spec.md`
- Supersedes D2 of: `specrunner/adr/2026-06-14-fast-pipeline-profile.md`
