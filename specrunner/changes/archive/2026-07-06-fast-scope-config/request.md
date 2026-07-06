# fast pipeline の forbidden surfaces を repo config に外出しする

## Meta

- **type**: spec-change
- **slug**: fast-scope-config
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

fast pipeline の permissionScope が禁止する 3 面（`src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts`）は spec-runner 自身の repo 構造をハードコードした値であり、製品コードに dogfooding 設定が漏れた状態になっている。他の repo で fast を選ぶと、存在しないパスに対する無意味な scope 宣言が適用される。

「pipeline の形（checkpoint・ゲート機構）は code、保護対象（どのパスが契約面か）は repo が持つ data」という原則に沿って、forbidden surfaces を per-repo config に移す。spec-runner 自身の値は自 repo の `.specrunner/config.json`（team-shared として commit 可能）に移し、dogfooding の保護は維持する。

## 現状コードの前提

- `src/core/pipeline/registry.ts:155-162`: `FAST_DESCRIPTOR.permissionScope` に checkpoint（`conformance`）と forbidden 3 面（`public-types: src/core/port/**` / `persisted-format: src/state/schema.ts` / `state-transitions: src/state/lifecycle.ts`）がリテラルで宣言されている。descriptor は静的モジュール定数で、`getPipelineDescriptor(id)`（`:179-186`）は config を受け取らない。
- `src/core/pipeline/types.ts:31-54,123`: `ForbiddenSurface { id, paths }` / `PermissionScope { checkpoint, forbidden }` は data 形の値型で、`PipelineDescriptor.permissionScope` は optional。
- scope の消費側はすべて descriptor から流れてくる値を引数で受ける: `deriveScopeBreach`（`src/core/pipeline/scope.ts:58-76`、純関数）、`assertRuntimeSupportsScope`（`src/core/pipeline/runtime-capability-gate.ts:69-86`、**permissionScope の presence で判定**、profile 名分岐なし）、`computeExtraScopeFindings`（`src/core/step/scope-check.ts:35-63`）、`StepExecutor`（`src/core/step/executor.ts:72,749-752`、`src/core/pipeline/run.ts:55` で `descriptor.permissionScope` から注入）。
- per-run の descriptor 変換の前例: `composeReviewerDescriptor`（`src/core/pipeline/compose-reviewers.ts:32-139`）が base descriptor を spread で clone して steps / transitions を注入する（permissionScope は `...base` で保持、`:129-138`）。呼び出しは `run.ts:87-95,125-135` と `pipeline-run.ts:106`。
- config は `~/.config/specrunner/config.json`（user）に `<repoRoot>/.specrunner/config.json`（project、`src/config/store.ts:95`）を deep-merge して読む（`store.ts:65-113`）。schema は `src/config/schema.ts:393-490`（interface）+ `:684-900`（zod）。`resolve*Config` パターンの前例: `resolveDesignLayerConfig`（`:1102-1119`）。repo 単位 glob リストの前例: `archive.protectedPaths`（`:279,822-829`）。
- config は選択時（`src/core/command/pipeline-run.ts:66`、preflight 経由）にも実行時（`PipelineDeps extends StepContext`、`src/core/port/step-context.ts:16` の `config`）にも既に手元にある。
- `.gitignore:37-39`: `.specrunner/*` は ignore だが `!.specrunner/config.json` で config は commit 対象。spec-runner 自身の `.specrunner/config.json` は存在し `verification` / `steps` / `archive` セクションを持つ（forbidden surfaces 相当は未設定）。
- ADR `specrunner/adr/2026-06-14-fast-pipeline-profile.md` D2（`:53-75`）が現行ハードコードの 3 面と根拠を記録している。

## 要件

1. **config に fast の forbidden surfaces セクションを追加する。** `{ id: string, paths: string[] }` の配列を repo config（`.specrunner/config.json`、user 層との deep-merge は既存規則に従う）で宣言できるようにし、zod validation を通す。キー名は設計に委ねる（例: `pipeline.fast.forbiddenSurfaces`）。
2. **fast descriptor の forbidden surfaces を config から解決する。** config に宣言があれば registry のリテラルに代えてそれを用いる。**無指定なら forbidden は空**とし、コード側のハードコード 3 面は撤去する。checkpoint（conformance）は code のまま config 化しない。
3. **fast の scope 機構自体は無指定でも維持する。** forbidden が空でも `permissionScope` は presence を保ち、runtime capability gate（changed files を導出できない runtime での拒否）は現行どおり適用される。breach は forbidden が空なら発生しない。
4. **spec-runner 自身の `.specrunner/config.json` に現行 3 面を移す。** 本変更の PR 内で行い、dogfooding における保護を切れ目なく維持する。
5. **docs/configuration.md に fast pipeline と forbidden surfaces 設定の説明を追加する**（現状 docs に fast / permissionScope の記述が無い）。

## スコープ外

- standard / design-only への scope 宣言追加、profile の新設
- checkpoint 位置・breach 時の escalation 挙動・capability gate の判定方式の変更
- 検査タイミングの前倒し（implementer 直後の早期 breach 検出は別 request）
- pipeline 形状（steps / transitions）の config 開放

## 受け入れ基準

- [ ] config に forbidden surfaces を宣言した fixture で、宣言 paths への接触が conformance checkpoint で breach 検出されることがテストで固定される
- [ ] config 無指定の fixture で、breach が発生せず、かつ capability gate が fast に引き続き適用されることがテストで固定される
- [ ] 不正な config（id 欠落・paths が配列でない等）が validation エラーになることがテストで固定される
- [ ] `src/core/pipeline/registry.ts` に spec-runner 固有のパスリテラルが残っていない
- [ ] spec-runner 自身の `.specrunner/config.json` に現行 3 面が宣言されている
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **無指定 → forbidden 空（採用）** / 現行 3 面をコード既定として維持（却下: spec-runner 固有パスが全 repo の既定として出荷される状態が残り、本 request の動機が解消しない。data は repo が持つ——`archive.protectedPaths` と同じ整理）。
- **checkpoint は config 化しない（採用）**: 検査点は pipeline 形状の一部であり「shape is code」の原則に従う。config 化するのは保護対象パスという data のみ。
- **注入は descriptor 解決時の変換で行う（採用）**: `composeReviewerDescriptor` と同型の「base descriptor + config → 実効 descriptor」変換とし、静的 registry は純粋定数のまま保つ。消費側（scope.ts / capability-gate / executor）は descriptor 経由で値を受ける現行構造のため変更不要の見込み。却下: registry がグローバル config を読む（module 定数の純粋性が壊れ、テストが config 状態に依存する）。
- **fast の scope presence を維持（採用）** / forbidden 空なら permissionScope ごと外す（却下: capability gate の適用有無が config で変わると、同じ fast でも repo により保証の枠組みが変わってしまう。機構は一様、data のみ可変）。
