# Tasks: 設計レイヤ CLI（aozu）受け口の結線

<!-- 各タスクは書く直前に対象を grep で再検証すること。 -->

## T-01: config に `designLayer` セクションと resolve ヘルパを追加する

- [x] `src/config/schema.ts` に `interface DesignLayerConfig { enabled?: boolean; command?: string; requireCitationTypes?: string[] }` を追加し、`SpecRunnerConfig` に任意フィールド `designLayer?: DesignLayerConfig` を追加する。
- [x] `configSchema`（zod/v4-mini）に `designLayer` を `optional(object({ enabled: optional(...boolean), command: optional(非空 string), requireCitationTypes: optional(array(非空 string)) }))` として追加する。既存セクション（archive / inbox）と同じ書式・エラーメッセージ体裁に合わせる。
- [x] `RawConfig` に `designLayer?: Partial<Record<string, unknown>>` を追加する（pass-through）。
- [x] 既定値解決ヘルパ `resolveDesignLayerConfig(config): { enabled: boolean; command: string; requireCitationTypes: string[] }` を新設する（`resolveInboxConfig` パターン）。既定は `enabled=false` / `command="aozu"` / `requireCitationTypes=[]`。設置場所は `src/config/schema.ts`（型 `ResolvedDesignLayer` を export）。
- [x] zod のブール型は既存 schema で未使用のため、`boolean` を `zod/v4-mini` から import して用いる（無ければ `optional(...)` で許容する型を確認）。

**Acceptance Criteria**:
- 有効な `designLayer` を含む config が `validateConfig` を通過する。
- `enabled` / `command` / `requireCitationTypes` の型不正が `CONFIG_INVALID` を送出する。
- `designLayer` 不在の config で `resolveDesignLayerConfig` が `{ enabled:false, command:"aozu", requireCitationTypes:[] }` を返す。
- `typecheck` green。

## T-02: 入口ゲートモジュール `check-gate.ts` を実装する

- [x] `src/core/design-layer/check-gate.ts` を新設し `runDesignLayerCheckGate(params)` を実装する（design.md D2 の署名）。
- [x] `designLayer.enabled !== true` → `{ passed:true, skipped:true }`（spawn しない）。
- [x] 有効時: `args=["check","--request",requestMdPath]`。`requestType` が `requireCitationTypes` に含まれれば `--require-citation` を push。`spawn(command,args,{cwd})`。
- [x] `exitCode===0` → `{ passed:true, skipped:false }`。それ以外（1/2/null）→ 捕捉 stderr を `stderrWrite` へ透過し `{ passed:false, exitCode, diagnostics }`。
- [x] `spawn` 既定は `src/util/spawn.ts` の `spawnCommand`、`stderrWrite` 既定は `src/logger/stdout.ts` の `stderrWrite`（両方テストで注入可能に）。
- [x] ゲートは throw しない（合否解釈は呼び出し側）。

**Acceptance Criteria**:
- 無効時に注入 spawn が呼ばれないことをテストで固定。
- exit 0 で `passed:true`、exit 1/2 で `passed:false` かつ diagnostics に stderr が入ることをテストで固定。
- 列挙 type で `--require-citation` あり、非列挙 type でなしを、spawn 引数の検査で固定。

## T-03: `run` preflight にゲートを結線する

- [x] `src/core/preflight.ts` の `parseRequestMd(requestMdPath)`（:100）直後に、`resolveDesignLayerConfig(config)` を解決し `runDesignLayerCheckGate({ requestMdPath, requestType: request.type, designLayer, cwd })` を呼ぶ。
- [x] `passed===false` のとき `SpecRunnerError` を throw する。新コード `DESIGN_LAYER_CHECK_FAILED` を `src/errors.ts` の `ERROR_CODES` と `EXIT_CODE_MAP`（ARG_ERROR 相当）に追加し、`makeHint`/メッセージ体裁を既存コードに合わせる。message に「引用検証に失敗」旨、hint に aozu 診断の確認と修正を促す文言を入れる（診断本体は gate が既に stderr 透過済み）。
- [x] gate の spawn は既定の `spawnCommand` を用いる（preflight に新規 dep 追加は不要）。無効時 no-op なので既存 preflight テストへ影響しないことを確認する。

**Acceptance Criteria**:
- 有効 + exit 1 で `runPreflight` が `SpecRunnerError` を throw し、`run` が非 0 で中断することをテストで固定。
- 有効 + exit 0 で preflight が `PreflightResult` を返すことをテストで固定。
- 既存 `tests/core/preflight.test.ts` が無変更で green（designLayer mock 不在 → 無効 → spawn なし）。

## T-04: `request validate` にゲートを結線する

- [x] `src/core/command/request.ts` の `executeValidate` に任意 opts `{ cwd?: string; config?: SpecRunnerConfig; spawn?: SpawnFn }` を追加する（既存の 1 引数呼び出しと後方互換）。
- [x] parse 成功後、`config`（未指定なら `loadConfig(resolveRepoRoot(cwd))` をベストエフォート、失敗時は無効扱い）から `resolveDesignLayerConfig` し、`runDesignLayerCheckGate({ requestMdPath: filePath, requestType: 解決済み type, designLayer, cwd, spawn })` を呼ぶ。
- [x] `passed===false` のとき 1 を返す（既存 validate 失敗と同じ exit 1）。診断は gate が stderr 透過済み。
- [x] request type は parse 済み `ParsedRequest.type` から取得する（`parseRequestMdContent` の戻りを利用）。
- [x] `src/cli/command-registry.ts` の `request validate` handler が `process.cwd()` を opts.cwd として渡すよう更新する（config は executeValidate 内でベストエフォート解決でも可）。

**Acceptance Criteria**:
- 有効 + exit 1 で `executeValidate` が 1 を返し、stderr に aozu 診断が出ることをテストで固定。
- 有効 + exit 0 で 0 を返すことをテストで固定。
- 既存 `tests/unit/core/command/request.test.ts` の executeValidate 系が無変更で green（designLayer 未設定 → 無効 → spawn なし）。

## T-05: 出口 hook モジュール `mark-hook.ts` を実装する

- [x] `src/core/design-layer/mark-hook.ts` を新設し `runDesignLayerMarkHook(params)` を実装する（design.md D3 の署名）。
- [x] `designLayer.enabled !== true` → `{ status:"skipped" }`（spawn しない）。
- [x] 有効時: `args=["mark","implemented","--request",slug]`。`prNumber!==undefined` なら `--pr <n>` を push。`spawn(command,args,{cwd})`。
- [x] `exitCode===0` → `spawn("git",["add","-A"],{cwd})` で aozu の書き込みを staging し `{ status:"marked" }`（D7）。`git add` が非 0 なら escalation を返す。
- [x] `exitCode===1` → 警告文言のみ、`{ status:"unknown-slug" }`。
- [x] `exitCode===2` / `exitCode===null` → `formatEscalation` で escalation を組み `{ status:"error", escalation }`。

**Acceptance Criteria**:
- 無効時に spawn が呼ばれないことをテストで固定。
- exit 0 で `git add -A` が呼ばれ `marked` を返すこと、exit 1 で `unknown-slug`、exit 2/null で `error` を返すことをテストで固定。
- `prNumber` 有無で `--pr` の付与/非付与が切り替わることを引数検査で固定。

## T-06: archive orchestrator に出口 hook を結線する

- [x] `src/core/archive/orchestrator.ts` の `ArchiveInput` に任意 `designLayer?: ResolvedDesignLayer` を追加する。
- [x] Phase 0 で load 済みの `state` から `prNumber = state.pullRequest?.number` を保持する。
- [x] `git add specrunner/changes/`（:269 付近）の直後・`commitArchive`（:275）の直前に `runDesignLayerMarkHook({ slug, prNumber, designLayer: input.designLayer ?? 無効既定, cwd: recordDir, spawn })` を呼ぶ。`spawn` は transportAuth wrap 済みの local `spawn` を渡す。
- [x] `status==="error"` → `{ exitCode:1, escalation }` を返し中断。`status==="unknown-slug"` → `stderrWrite` に警告して継続。`status==="marked"|"skipped"` → 継続。
- [x] `src/core/archive/merge-then-archive.ts` の `MergeThenArchiveInput` に任意 `designLayer?` を追加し、`runArchiveOrchestrator` 呼び出し（:205）へ素通しする。
- [x] `src/cli/archive.ts` で `loadConfig` 済み config から `resolveDesignLayerConfig` し、`runMergeThenArchive` と `runArchiveOrchestrator` の両呼び出しに `designLayer` を渡す。config load 失敗時は無効既定（既存の best-effort パターンに一致）。非 `--with-merge` 経路でも config を best-effort 解決して渡す。

**Acceptance Criteria**:
- 実 temp git repo で、fake が recordDir に書いた state ファイルが feature ブランチの archive コミットに含まれることを `git show --name-only` 等で固定。
- mark exit 1 で archive が成功継続（exitCode 0）、exit 2 で escalation 失敗（exitCode 1）することを固定。
- `designLayer` 無効時に mark が spawn されず、archive コミットが既存どおり生成されることを固定。

## T-07: doctor に aozu presence check を追加する

- [x] `src/core/doctor/checks/runtime/aozu-cli.ts` を新設し、`codex-cli.ts` パターンで `aozuCliCheck: DoctorCheck`（category `"runtime"`）を実装する。
- [x] `ctx.config.get("designLayer.enabled") !== true` → `{ status:"pass", message:"aozu CLI not required (design layer integration disabled)" }`（execFile 呼ばない）。
- [x] 有効時: `command = (ctx.config.get("designLayer.command") as string|undefined) ?? "aozu"`。`ctx.execFile(command, ["--version"], { signal: AbortSignal.timeout(5000) })` を試行。reject → `{ status:"fail", message, hint }`。resolve → `{ status:"pass", message }`。
- [x] `src/core/doctor/checks/index.ts` の `commonChecks` に `aozuCliCheck` を追加し、re-export にも足す（import は runtime グループへ）。

**Acceptance Criteria**:
- 有効 + `execFile` reject で status fail かつ hint を含むことをテストで固定。
- 無効で status pass かつ `execFile` 未呼び出しをテストで固定。
- doctor が local / managed 双方で本 check を含むこと（`commonChecks` 所属）を確認。

## T-08: request テンプレに設計要素引用セクションを追加する

- [x] `src/core/command/request.ts` の `buildScaffoldTemplate` に `## 設計要素引用` セクションを `## 現状コードの前提` と `## 要件` の間へ追加する。本文は規約コメント（この request が実装する設計要素の `[[id]]` を列挙する場所であること、設計レイヤ未導入プロジェクトでは省略可であること）+ プレースホルダ。
- [x] `src/prompts/request-generate-system.ts` の "Required Format" 節に、この節を optional セクションとして追記する（`## 現状コードの前提` と同格）。
- [x] `docs/request-authoring.md` に設計要素引用の節を追加し、意味と任意性を説明する。
- [x] 追加後も `parseRequestMdContent` が green を保つこと（parser 変更は不要）を確認する。

**Acceptance Criteria**:
- `executeTemplate` 出力に設計要素引用セクションの見出しと規約コメントが含まれることをテストで固定（テンプレ固定テストの更新を含む）。
- 引用セクションを含むテンプレが `parseRequestMdContent` を例外なく通過することを固定。

## T-09: テスト用 fake と契約固定を整備する

- [x] gate / hook / doctor の各テストで注入 `SpawnFn` / `execFile` により契約（exit 0/1/2/null、stderr 診断書式）を模す。
- [x] archive コミット包含テスト用に、`mark implemented` 呼び出しで exit 0 を返す fake `SpawnFn` を用意し orchestrator の挙動を固定する。
- [x] aozu 実物への依存が無いことを保証する（インストール有無に関わらず全テストが決定的）。

**Acceptance Criteria**:
- 受け入れ基準の各項目が fake のみで決定的に検証される。
- テストが aozu 実物の PATH 有無に依存しない。

## T-10: 検証ゲート

- [x] 既存テストが無変更で green（designLayer 無効時の完全な挙動保存）。
- [x] `bun run typecheck` green。
- [x] `bun run lint` green。
- [x] `bun run build` 成功。
- [x] 本 change で追加した全テストが green。

**Acceptance Criteria**:
- `typecheck` / `lint` / `build` / `test` がすべて成功する。
- 既存テストの差分が無い（新規テストの追加のみ、テンプレ固定テストの節追加を除く）。
