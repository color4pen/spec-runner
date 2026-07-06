# Design: fast pipeline forbidden surfaces を repo config に外出しする

## Context

fast pipeline profile は `permissionScope` を宣言し、conformance checkpoint で「変更が禁止サーフェスに触れたか」を機械導出して breach を escalation する。現状その禁止サーフェスは `src/core/pipeline/registry.ts` の `FAST_DESCRIPTOR.permissionScope.forbidden` に 3 面がリテラルでハードコードされている:

- `public-types` → `src/core/port/**`
- `persisted-format` → `src/state/schema.ts`
- `state-transitions` → `src/state/lifecycle.ts`

この 3 面は spec-runner 自身の repo 構造に固有の値であり、製品コード（全 repo に配布される registry 定数）に dogfooding 設定が漏れた状態になっている。他の repo で fast を選ぶと、存在しないパスに対する無意味な scope 宣言が適用される。

原則: **pipeline の形（steps / transitions / checkpoint 位置）は code、保護対象（どのパスが契約面か）は repo が持つ data**。既に `archive.protectedPaths` が同じ整理（glob リストを repo config が持つ）で存在する。本変更はこの整理を forbidden surfaces にも適用する。

### 現状の構造（変更の土台）

- **宣言**: `FAST_DESCRIPTOR.permissionScope`（registry、静的モジュール定数）。`getPipelineDescriptor(id)` は config を受け取らない純関数。
- **型**: `ForbiddenSurface { id; paths }` / `PermissionScope { checkpoint; forbidden }`（`src/core/pipeline/types.ts`、data 形の値型）。`PipelineDescriptor.permissionScope` は optional。
- **消費側**（すべて descriptor から流れる値を引数で受ける）:
  - `deriveScopeBreach`（`scope.ts`、純関数）: `scope` 不在 or `forbidden.length === 0` → `{ breached: false }`。
  - `assertRuntimeSupportsScope`（`runtime-capability-gate.ts`）: `descriptor.permissionScope !== undefined` の **presence** で判定。profile 名分岐なし。
  - `computeExtraScopeFindings`（`scope-check.ts`）: `stepName === checkpoint` かつ runtime が導出可能なときのみ breach 合成。
  - `StepExecutor`（`executor.ts`）: `descriptor.permissionScope` を `run.ts:55` の `buildPipeline` で注入される。
- **descriptor 変換の前例**: `composeReviewerDescriptor(base, snapshots)`（`compose-reviewers.ts`）が base descriptor を spread で clone して steps / transitions を注入。reviewer 不在時は `base` を参照同一で返す（zero-overhead 不変）。呼び出しは `run.ts:87-95,125-135`。
- **config 解決の前例**: `resolveArchiveConfig` / `resolveDesignLayerConfig`（`schema.ts`）が config セクションを既定込みで解決する named resolver。config 層は `pipeline?: PipelineConfig`（`maxRetries` のみ）を既に持つ。
- **config 読込**: user global（`~/.config/specrunner/config.json`）に project local（`<repoRoot>/.specrunner/config.json`）を deep-merge（`merge.ts`、**array は overlay が置換**、object は再帰）。
- **dogfooding config の commit**: `.gitignore` は `.specrunner/*` ignore + `!.specrunner/config.json` 例外で、spec-runner 自身の project local config を team-shared として commit 可能。既存の `.specrunner/config.json` は `verification` / `steps` / `archive` を持つ（forbidden 相当は未設定）。

## Goals / Non-Goals

**Goals**:

- forbidden surfaces を per-repo config（`.specrunner/config.json`、user 層との deep-merge は既存規則に従う）で宣言でき、zod validation を通せる。
- fast descriptor の forbidden を config から解決する。**無指定なら forbidden は空**。registry の spec-runner 固有リテラル 3 面を撤去する。
- forbidden が空でも `permissionScope` の presence を維持し、runtime capability gate が現行どおり適用される。breach は空なら発生しない。
- spec-runner 自身の `.specrunner/config.json` に現行 3 面を移し、dogfooding の保護を切れ目なく維持する。
- docs/configuration.md に fast pipeline / forbidden surfaces 設定を記述する。

**Non-Goals**（request スコープ外を継承）:

- standard / design-only への scope 宣言追加、profile の新設。
- checkpoint 位置・breach 時の escalation 挙動・capability gate の判定方式の変更。
- 検査タイミングの前倒し（早期 breach 検出）。
- pipeline 形状（steps / transitions）の config 開放。
- content 粒度の scope（現行どおり path 粒度のみ）。

## Decisions

### D1: forbidden surfaces を config data として持ち、registry のリテラルを撤去する

`FAST_DESCRIPTOR.permissionScope.forbidden` を `[]`（空配列）に変え、`checkpoint: "conformance"` の presence は維持する。3 面リテラルと選定根拠のコメントは registry から削除する。保護対象パスは repo が持つ data として `.specrunner/config.json` へ移す。

- **Rationale**: 「data は repo が持つ」——`archive.protectedPaths` と同じ整理。3 面リテラルを残すと spec-runner 固有パスが全 repo の既定として出荷され続け、本 request の動機が解消しない。
- **Alternatives considered**:
  - 現行 3 面をコード既定として維持し config で上書き可能にする → 却下: 「無指定でも spec-runner のパスが全 repo に効く」状態が残る。無指定 → 空が唯一動機を満たす。
  - checkpoint も config 化 → 却下（D3）。

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

- **Rationale**: profile 名（`fast`）で namespace すると、将来 scope を宣言する別 profile が同じ `pipeline.<id>.forbiddenSurfaces` パターンで自然に拡張できる。既存 `pipeline` セクションの下に収めることで config の階層が増えない。
- **Alternatives considered**:
  - top-level `forbiddenSurfaces` → 却下: どの profile の scope かが表現できない。
  - `permissionScope` を丸ごと config 化（checkpoint 含む）→ 却下（D3）。

### D3: checkpoint は config 化しない（shape is code, data is repo）

config が開放するのは `forbidden`（保護対象パス = data）のみ。`checkpoint`（= conformance、検査点）は registry の code に残す。

- **Rationale**: 検査点は pipeline 形状の一部。「shape is code」原則に従う。config 化するのは保護対象という data だけ。
- **Alternatives considered**: `permissionScope` 全体を config 化 → 却下: checkpoint を任意 step にできると、非 judge step を checkpoint に指定するなど不整合な設定を許してしまい、pipeline 形状が config に漏れる。

### D4: 注入は descriptor 解決時の変換で行う（registry は純粋定数のまま）

新しい純関数 `applyScopeConfig(base: PipelineDescriptor, config): PipelineDescriptor` を core/pipeline に追加する。`composeReviewerDescriptor` と同型の「base descriptor + config → 実効 descriptor」変換:

- `base.permissionScope` が不在（standard / design-only）→ `base` を参照同一で返す（zero-overhead 不変）。
- 存在するとき → `{ ...base, permissionScope: { checkpoint: base.permissionScope.checkpoint, forbidden: <config 解決値> } }` を返す。

config 解決は config 層の named resolver `resolvePipelineForbiddenSurfaces(config, pipelineId)` に委譲する（`resolveArchiveConfig` と同じ場所・同じ責務）。`pipelineId === "fast"` → `config.pipeline?.fast?.forbiddenSurfaces ?? []`、それ以外 → `[]`。id → config 位置のマッピングはこの resolver 1 箇所に閉じる。

`resolvePipelineForbiddenSurfaces` は config 層に置き、config 層に閉じた型（`{ id: string; paths: string[] }`）を返す。core 層の `ForbiddenSurface`（`paths: readonly string[]`）とは構造的に代入互換なので、`applyScopeConfig` は返り値をそのまま `forbidden` に載せられ、config → core の上向き import は発生しない（layer 方向は config → core を持たない）。

- **Rationale**: registry がグローバル config を読むと module 定数の純粋性が壊れ、テストが config 状態に依存する。変換を descriptor 解決時に置くことで registry は純粋定数のまま、消費側（`scope.ts` / capability-gate / executor）は descriptor 経由で値を受ける現行構造を保てる（**消費側コードは変更不要**）。
- **Alternatives considered**:
  - registry がグローバル config を読む → 却下（上記）。
  - 各消費側が個別に config を読む → 却下: scope の値が複数箇所に散り、descriptor が単一の真実でなくなる。

### D5: 変換の配線位置は runtime descriptor 解決の 2 箇所。preflight gate は presence 維持で不変

runtime で descriptor を解決するのは `run.ts` の `buildPipelineForJob` と `runPipeline` の 2 箇所（両者とも `getPipelineDescriptor` → `composeReviewerDescriptor`）。この間に `applyScopeConfig(base, deps.config)` を挿入し、`composeReviewerDescriptor(scoped, jobState.reviewers)` へ渡す。`buildPipeline`（`run.ts:55`）が `descriptor.permissionScope` を `StepExecutor` に注入するため、解決済み forbidden はこの経路で breach 検出まで届く。

preflight（`pipeline-run.ts` の capability gate）は変更しない: `assertRuntimeSupportsScope` は `descriptor.permissionScope` の **presence** のみを読み、presence は registry 定数（forbidden 空でも `permissionScope` 自体は存在）で保たれるため、config の有無に関わらず gate は現行どおり発火する。

- **Rationale**: gate は presence 判定。forbidden の中身は gate の判定に関与しない。preflight を触らないことで変更面を最小化し、「機構は一様、data のみ可変」を保つ。
- **Alternatives considered**: preflight でも `applyScopeConfig` を適用 → 不要（gate は forbidden を読まない）。将来 preflight が forbidden を参照するようになった場合に再検討する（Open Question）。
- **Order 補足**: `composeReviewerDescriptor` は `...scoped` で permissionScope を保持する（reviewer 注入と scope 解決は独立）。scope 解決を先に置くことで、reviewer 有無どちらでも解決済み scope が保たれる。

### D6: dogfooding config の移設は本 PR 内で原子的に行う

registry からリテラルを外す変更（無指定 → 空）と、spec-runner 自身の `.specrunner/config.json` への 3 面追加を **同一 PR** で行う。片方だけが merge されると spec-runner 自身の dogfooding 保護が一時的に切れる。

- **Rationale**: 保護の連続性。registry 撤去だけ先行すると自 repo の fast run が無防備になる。
- **Alternatives considered**: 段階リリース → 却下: 中間状態で dogfooding 保護が切れる。

## Risks / Trade-offs

- **[Risk] registry リテラル撤去で既存テストが赤くなる**（`fast-descriptor.test.ts` の T-04-5 が 3 面を、`fast-scope-checkpoint.test.ts` が `FAST_DESCRIPTOR.permissionScope` を直接 breach 源として参照）→ **Mitigation**: これらのテストを更新する。registry 定数側は「presence + checkpoint + forbidden 空」を固定するテストへ、3 面の breach 検出は config fixture から `applyScopeConfig` で scope を組み立てるテストへ移す（tasks T-05, T-06）。
- **[Risk] config validation が緩いと不正な forbidden が silent に無視される**（例: `paths` が配列でない）→ **Mitigation**: zod で `id` を必須非空 string、`paths` を配列（要素は非空 string）として検証し、不正 config が validation エラーになることをテストで固定する（tasks T-02, T-07）。
- **[Risk] deep-merge の array 置換規則を知らずに user/project 両方で宣言すると片方が消える**→ **Mitigation**: docs に「forbiddenSurfaces は array なので project local が user global を丸ごと置換する（既存 merge 規則）」を明記する（tasks T-08）。
- **[Trade-off] 無指定 → 空**により、fast を新規採用した repo は明示宣言するまで scope 保護ゼロ。これは意図した挙動（保護対象は repo が宣言する data）であり、capability gate は presence で維持されるため「導出不能 runtime での fast 拒否」という別レイヤの保証は残る。

## Migration Plan

- 本変更は additive（config キー新設）+ 既定変更（registry 3 面 → 空）。
- 他 repo への影響: fast を未使用の repo は無影響。fast 使用 repo は、これまで暗黙に効いていた spec-runner 固有 3 面が消えるため、自 repo の契約面を `pipeline.fast.forbiddenSurfaces` に宣言する必要がある（docs に手順を記載）。
- spec-runner 自身: 本 PR で `.specrunner/config.json` に 3 面を追加し、保護を切れ目なく維持（D6）。
- rollback: config キーは optional・無指定 = 空なので、revert しても config 側は無害（registry リテラルが戻るだけ）。

## Open Questions

- 将来 preflight（着手前）で forbidden の内容を参照する要件が出た場合、preflight にも `applyScopeConfig` を適用する必要が生じる。現状 gate は presence のみで足りるため未対応（D5）。
- `paths` 空配列の許容: 現状は許容（マッチせず無害、`archive.protectedPaths` と同様）。厳格化（1 件以上必須）にするかは要件化されておらず、緩い側に倒す。
