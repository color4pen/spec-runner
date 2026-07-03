# Design: 設計レイヤ CLI（aozu）受け口の結線 — 入口ゲートと出口 hook

## Context

設計レイヤ CLI **aozu** は、プロダクトリポジトリの設計文書を正本として管理する決定的ツールで、実装パイプライン向けの交換面契約 v0 を公開している。契約は呼び出し側に 2 つの結線点を推奨する:

- **入口**: request 検証で `aozu check --request <path>` を実行し、request 本文中の `[[id]]` 引用を実在解決・状態検証する。
- **出口**: 取り込み完了時に `aozu mark implemented --request <slug> [--pr <n>]` を実行し、`request` が当該 slug の requested 設計要素を implemented へ遷移する（冪等）。

spec-runner にはこの受け口が無く、引用検証も implemented 遷移も人手のままである。本 change はこの 2 点を **opt-in の固定結線**として実装する。

### aozu CLI 契約（本 change が依存する外部インターフェース）

| 呼び出し | 意味 | exit 0 | exit 1 | exit 2 | 診断 |
|----------|------|--------|--------|--------|------|
| `aozu check --request <path> [--require-citation]` | 本文中の全 `[[id]]` を抽出し実在解決 + 状態（designed \| requested）検証。`--require-citation` は引用 0 件を不合格化 | 合格 | 不合格（引用未解決等） | 入力不正（ファイル不在 / `design/` 不在） | stderr に 1 行 1 診断 `<LEVEL> <CODE> <id> <message>` |
| `aozu mark implemented --request <slug> [--pr <n>]` | 設計側 state で `request == <slug>` の requested 要素を implemented へ遷移。冪等（再実行 no-op、全遷移 or 全不変） | 遷移完了（no-op 含む） | 未知の slug（aozu 管理下にない） | 入力不正 | — |

消費者側の唯一の前提は「request 文書が本文中の `[[id]]` 引用を受け入れること」。aozu の内部（`design/` の物理レイアウト等）は契約の対象外で、spec-runner はこれに依存しない。

### 現状コード（grep 再検証済み）

- `src/core/preflight.ts:100` — `runPreflight` が `parseRequestMd(requestMdPath)` を実行。入口ゲートはこの直後に置く。config はこの時点で `config` として解決済み。
- `src/core/command/request.ts:95` — `executeValidate(filePath)`。request 検証のもう一つの入口。現在 `filePath` のみを受け取り config を持たない。
- `src/core/command/request.ts:16` — `buildScaffoldTemplate({title,type,slug})`。現行セクションは Meta / 背景 / 現状コードの前提 / 要件 / スコープ外 / 受け入れ基準 / architect 評価済みの設計判断。引用の置き場は無い。`executeTemplate` と `request-new.ts:executeNew` が唯一の消費者。
- `src/core/archive/orchestrator.ts` — 設計不変条件「base へ checkout / commit / push しない。archive コミットは feature ブランチに記録し remote feature ブランチへ push」。`runArchiveOrchestrator` の Phase 1 は recordDir（worktree 又は no-worktree の cwd）で `git mv` → `markJobArchived` → draft 削除 → `git add specrunner/drafts` / `git add specrunner/changes/` → `commitArchive` → `git push origin <feature-branch>` の順。`commitArchive`（`src/core/finish/commit-archive.ts`）は **staged 済み**（`git diff --cached`）を `chore: archive <slug>` として commit する。Phase 0 で job state を load 済み（`state`）。
- `src/core/archive/merge-then-archive.ts:142` — `state.pullRequest.number` から PR 番号を得る。:205 で `runArchiveOrchestrator` を呼ぶ（archive 記録は merge の前）。
- `src/config/schema.ts` — config は zod/v4-mini schema + 意味検査の 2 層。`archive` 等の任意セクションは `optional(object({...}))`。設計レイヤ関連セクションは無い。project local config は `<repoRoot>/.specrunner/config.json`（user global と deep merge）。
- `src/core/doctor/checks/runtime/codex-cli.ts` — 外部 CLI presence 検証の既存パターン（`ctx.execFile(cmd, ["--version"], { signal })`、条件付き required、install ヒント返却）。`commonChecks` は全 runtime、`localChecks` / `managedChecks` は runtime 別（`src/cli/doctor.ts:179`）。
- `src/util/spawn.ts` — `SpawnFn = (cmd, args, {cwd,env,timeoutMs}) => Promise<{exitCode, stdout, stderr}>`。`node:child_process.spawn`、`shell:false`、非 0 でも throw しない、ENOENT は `exitCode: null` + `stderr: err.message`。secrets は `stripSecrets` 済み。
- 汎用の post-merge hook / 任意コマンド差し込み機構は無い（`verification.commands` は verification step 限定）。
- 実行時依存は極小（`dependencies` は Anthropic SDK のみ）。外部ツールは npm 依存でなく CLI spawn で結合する規律。

## Goals / Non-Goals

**Goals**:

- 結線が有効なとき、`request validate` と `run` の preflight の両方で `aozu check --request` を実行し、非 0 を不合格とする（ゲート実装は単一モジュール、二重実装しない）。aozu の stderr 診断を利用者出力へ透過する。config で列挙された request type に `--require-citation` を付与する。
- 取り込み（archive）フェーズで `aozu mark implemented --request <slug> --pr <n>` を worktree 内（feature ブランチ）で実行し、生じた設計側 state 変更を **archive コミットに相乗り**させて push する。base への反映は既存 squash merge に委ねる。exit 1 は警告継続、exit 2 は失敗。
- opt-in の設計レイヤ結線 config セクションを追加する。既定無効。無効時は aozu を一切 spawn せず既存挙動を完全保存する。コマンド名は注入可能（既定 `"aozu"`）。
- 結線有効時に `aozu` CLI presence を検証する doctor check を追加する。
- request テンプレに設計要素引用セクション（任意）を追加し、生成プロンプトと authoring docs を整合させる。
- テストは aozu 実物に依存せず、契約（exit code / stderr 書式）を模した fake で固定する。

**Non-Goals**（request スコープ外に一致）:

- パイプライン起点 topic の排出（aozu 側契約追補が前提）。
- CI への `aozu check` / `export rules --verify` の結線。
- ruleset（`export rules`）消費側（architecture test）の実装。
- 汎用 post-merge hook / 任意コマンド差し込み機構の新設。本件は設計レイヤ結線に限定した固定結線とする。
- aozu 本体の変更。
- `parser/request-md.ts` での `[[id]]` 専用抽出（aozu が本文全体から抽出するため不要）。

## Decisions

### D1: config に provider-agnostic な `designLayer` セクションを追加する

`SpecRunnerConfig` に任意セクション `designLayer` を追加する:

```jsonc
// <repoRoot>/.specrunner/config.json
{
  "designLayer": {
    "enabled": true,              // 既定 false。false / 不在で結線を完全に無効化
    "command": "aozu",            // 既定 "aozu"。spawn するコマンド名（注入可能）
    "requireCitationTypes": [     // 既定 []。check に --require-citation を付ける request type の列挙
      "new-feature", "spec-change"
    ]
  }
}
```

- schema key は generic な `designLayer`（`aozu` を schema に焼き込まない）。実コマンド名は `command` 経由で注入し、既定 `"aozu"`。これは architect 決定「aozu は npm 依存にせず config 注入コマンド名を spawn」と、MEMORY「自前 CLI config に upstream provider 固有名を流用しない」の両方に整合する。
- `resolveDesignLayerConfig(config): ResolvedDesignLayer` を新設し、`{ enabled, command, requireCitationTypes }` を欠損既定込みで返す（`resolveInboxConfig` / `resolveTransientRetryConfig` と同じパターン）。全消費者（gate / hook / doctor）はこの解決済み値のみを参照する。
- `enabled !== true` のとき全結線点は spawn せず即 return（無効時の完全な挙動保存）。

**Rationale**: 既存 config は「任意セクション + resolve ヘルパ」で拡張してきた（archive / inbox / transientRetry）。同型で追加すれば schema 検査・deep merge・後方互換が既存機構に乗る。**却下した代替**: (a) env var での有効化 — team 共有される project config に載らず、`.specrunner/config.json` commit 共有の設計に反する。(b) schema key を `aozu` にする — 特定ツール名を契約表面に固定してしまい、注入可能コマンド名の設計と矛盾する。

### D2: 入口ゲートは単一モジュールに実装し preflight と validate の両方から呼ぶ

新モジュール `src/core/design-layer/check-gate.ts`:

```
runDesignLayerCheckGate(params: {
  requestMdPath: string;
  requestType: string;
  designLayer: ResolvedDesignLayer;
  cwd: string;
  spawn?: SpawnFn;                 // 既定 spawnCommand（テストで注入）
  stderrWrite?: (s: string) => void;  // 既定 stderrWrite（診断透過）
}): Promise<DesignLayerGateResult>

type DesignLayerGateResult =
  | { passed: true; skipped: boolean }        // skipped: 無効で spawn せず
  | { passed: false; exitCode: number; diagnostics: string };
```

- `designLayer.enabled !== true` → `{ passed: true, skipped: true }`（spawn しない）。
- 有効時: `args = ["check", "--request", requestMdPath]`。`requestType ∈ designLayer.requireCitationTypes` なら `args.push("--require-citation")`。`spawn(command, args, { cwd })`。
- `exitCode === 0` → `{ passed: true, skipped: false }`。
- `exitCode !== 0`（1 / 2 / null）→ 捕捉した aozu の stderr を `stderrWrite` で利用者出力へ透過し、`{ passed: false, exitCode, diagnostics }` を返す。`exitCode: null`（ENOENT = 結線有効なのにコマンド不在）も不合格として扱う。
- ゲート自体は throw しない。合否の解釈は呼び出し側に委ねる:
  - **preflight**（`preflight.ts:100` の `parseRequestMd` 直後）: `passed === false` なら `SpecRunnerError`（新コード `DESIGN_LAYER_CHECK_FAILED`、exit は ARG_ERROR 相当）を throw。`run.ts` の catch が `err.message` を出力し `err.exitCode` を返す。
  - **executeValidate**（`request.ts:95`、parse 成功後）: `passed === false` なら 1 を返す（既存 validate 失敗と同じ exit 1）。`executeValidate` は config / cwd / spawn を受け取れるよう任意 opts を追加し、command-registry の validate handler が `process.cwd()` と解決済み config を渡す。opts 未指定（＝既存の 1 引数呼び出し）では config をベストエフォート解決し、無効なら no-op。

**Rationale**: 契約は決定的 CLI の exit code / 診断書式で機械的合否を与える。単一モジュール化で二重実装を避け、両入口が同一の合否規則を共有する。**却下した代替**: request-review（LLM step）のプロンプトへ引用検査を足す — 非決定的で、exit code / 診断書式による機械照合が得られない（architect 決定に一致）。

### D3: 出口 hook は archive フェーズ・feature ブランチに置き、archive コミットに相乗りさせる

新モジュール `src/core/design-layer/mark-hook.ts`:

```
runDesignLayerMarkHook(params: {
  slug: string;
  prNumber?: number;
  designLayer: ResolvedDesignLayer;
  cwd: string;                     // recordDir（worktree 又は no-worktree の cwd）
  spawn: SpawnFn;                  // orchestrator の（transportAuth wrap 済み）spawn を渡す
  stdoutWrite / stderrWrite;
}): Promise<MarkHookResult>

type MarkHookResult =
  | { status: "skipped" }                         // 無効 → spawn なし
  | { status: "marked" }                          // exit 0
  | { status: "unknown-slug" }                    // exit 1 → 警告継続
  | { status: "error"; escalation: string };      // exit 2 / null → 失敗
```

- `designLayer.enabled !== true` → `{ status: "skipped" }`（何も spawn しない）。
- 有効時: `args = ["mark", "implemented", "--request", slug]`。`prNumber !== undefined` なら `args.push("--pr", String(prNumber))`。`spawn(command, args, { cwd })`。
- `exitCode === 0` → 生じた設計側 state 変更を staging するため `spawn("git", ["add", "-A"], { cwd })` を実行し `{ status: "marked" }`（D7 参照）。
- `exitCode === 1`（未知の slug = aozu 管理下にない request）→ 警告ログのみ、`{ status: "unknown-slug" }`。
- `exitCode === 2` / `exitCode === null`（入力不正 / spawn 失敗 = 設定不整合）→ `{ status: "error", escalation }`。

**orchestrator への組み込み**（`runArchiveOrchestrator`）:

- Phase 0 で load 済みの `state` から `prNumber = state.pullRequest?.number` を抽出し保持する。
- Phase 1 の既存 `git add specrunner/changes/`（`orchestrator.ts:269`）の**直後**、`commitArchive`（:275）の**直前**に hook を呼ぶ。これにより有効時は aozu の書いた state 変更が同じ archive コミットに入り、無効時は挿入点が完全 no-op で既存挙動不変。
  - `status === "error"` → `{ exitCode: 1, escalation }` を返し archive を中断（squash merge に届かず fail-safe）。
  - `status === "unknown-slug"` → `stderrWrite` に警告を出し継続。
  - `status === "marked" | "skipped"` → 継続。
- `designLayer` は `ArchiveInput` と `MergeThenArchiveInput` に任意フィールドとして追加。`runMergeThenArchive` は `runArchiveOrchestrator` 呼び出し（:205）へ素通しする。CLI `src/cli/archive.ts` が config から `resolveDesignLayerConfig` して両経路へ渡す（config load 失敗時は無効扱い、既存の best-effort パターンに一致）。

**Rationale**（architect 決定に一致）: archive コミットと同じ配達経路（feature ブランチ → squash merge）に相乗りするため新配達機構を持たず、base 直コミット禁止の不変条件を守り（base から見た遷移はちょうど merge 時点）、merge が失敗すれば遷移も base に届かない（fail-safe）。mark implemented の冪等性により archive 再実行にも安全。exit 1 を警告に留めるのは、設計レイヤ管理下にない通常 request（bug-fix 等）が正常系として存在し、乖離は aozu 側 status のフロンティア表示で観測可能かつ冪等 mark で回復できるため。**却下した代替**: (a) merge 成功後に base へ直接コミット — 不変条件違反。(b) state 変更だけの追い PR — request 毎に PR 2 本で重く、設計状態の収束が遅れる。

### D4: doctor check は結線有効時のみ `command` の presence を検証する

新モジュール `src/core/doctor/checks/runtime/aozu-cli.ts` を `codex-cli.ts` パターンで作り、`checks/index.ts` の `commonChecks` に登録する（設計レイヤ結線は runtime 非依存のため local / managed 双方で走る `commonChecks` が適所）。

- `ctx.config.get("designLayer.enabled") !== true` → `{ status: "pass", message: "aozu CLI not required (design layer integration disabled)" }`（spawn なし）。
- 有効時: `command = ctx.config.get("designLayer.command") ?? "aozu"`。`ctx.execFile(command, ["--version"], { signal: AbortSignal.timeout(5000) })` で presence 検証。reject（ENOENT / 実行不可）→ `{ status: "fail", message, hint: "<command> を PATH に導入するか designLayer.command を修正してください" }`。resolve → `{ status: "pass" }`。

**Rationale**: 既存の外部 CLI presence 検証パターンをそのまま踏襲し、doctor の他 check と同じ `DoctorContext.execFile` 注入でテスト可能。**Open Question**（後述）: aozu の presence probe に用いる flag。

### D5: request テンプレに任意の設計要素引用セクションを追加し、生成プロンプトと docs を整合させる

- `buildScaffoldTemplate`（`request.ts:16`）に任意セクション `## 設計要素引用` を追加する。配置は `## 現状コードの前提` と `## 要件` の間。本文は規約コメント（設計レイヤ導入プロジェクトで、この request が実装する設計要素の `[[id]]` を列挙する場所。未導入プロジェクトでは省略可）+ プレースホルダ。aozu は本文全体から抽出するため見出し名・位置は緩く、parser 変更は不要（Non-Goals）。
- `src/prompts/request-generate-system.ts` の "Required Format" に、この節を optional セクションとして追記する（`## 現状コードの前提` と同格の任意節）。
- `docs/request-authoring.md` に節を追加し、引用の意味と任意性を説明する。
- `executeTemplate` / `executeNew` は `buildScaffoldTemplate` の唯一の消費者なので、テンプレ変更は両者へ自動伝播する。既存の `.toContain` ベース固定テスト（`tests/unit/core/command/request.test.ts`）に節見出しの存在チェックを追加する（受け入れ基準「テンプレ系スナップショットの更新を含む」に対応）。

**Rationale**: aozu の引用抽出は本文全体を対象とするため、置き場と規約コメントを与えるだけで足りる。専用の parser / schema を持たない分、疎結合を保つ。

### D6: テストは fake で契約を固定し、aozu 実物に依存しない

- **gate / hook の単体テスト**: 注入 `SpawnFn` が canned な `{ exitCode, stdout, stderr }` を返すことで契約（exit 0/1/2/null と stderr 診断書式）を模す。
- **archive コミット包含テスト**: 実 temp git repo 上で、`mark implemented` 呼び出し時に recordDir へ state ファイルを書き exit 0 を返す fake `SpawnFn` を注入。orchestrator の `git add -A` + `commitArchive` を通し、当該ファイルが feature ブランチの archive コミットに含まれることを `git show --name-only HEAD` 等で固定する。
- **doctor テスト**: `DoctorContext.execFile` を注入し reject/resolve で不在/存在を模す。
- **実 spawn / execFile 経路の忠実性が要るケース**（任意）: `tests/fixtures/fake-aozu`（`--version` / `check` / `mark` を arg 分岐し、`FAKE_AOZU_EXIT` 等の env で exit を制御、`check` 時は診断を stderr へ、`mark` 時は指定パスへ state を書く小さな実行体）を用意し、`command` にそのパスを注入する。

**Rationale**: 契約（CLI 署名・exit code・診断書式）だけに依存し、aozu 内部やインストール有無に依存しない。受け入れ基準の各項目を決定的に固定できる。

### D7: aozu の書き込みは `git add -A` で捕捉する（設計側ファイルレイアウトを知らない）

出口 hook は exit 0 後、recordDir で `git add -A` を実行して aozu が生じた変更を staging する。

**Rationale**: spec-runner は契約（CLI 署名と exit code）以外に aozu の内部を知らない、という architect 決定に忠実であるため、設計側 state ファイルの物理パス（`design/…`）を hardcode せず、working-tree の結果差分を丸ごと捕捉する。archive 記録時点の recordDir は job 専用 worktree（PR 作成済＝実装変更は commit / push 済）で、未 commit 差分は archive の `git mv` / status 更新（既に staged）と aozu の書き込みに限られるため、`-A` の over-staging リスクは限定的。`.gitignore` は尊重される。**却下した代替**: `git add design/` のパス固定 — aozu の内部レイアウトへの依存を持ち込み、契約のみ結合の原則に反する。

## Risks / Trade-offs

- **[Risk] `git add -A` が想定外ファイルを stage する** → Mitigation: 挿入点は archive 記録の末尾（既存の scoped add 群の直後）で、この時点の worktree は PR 作成後でクリーン。`.gitignore` 尊重。無効時は hook 自体が no-op で `git add -A` を走らせない。
- **[Risk] `executeValidate` に config 解決を足すことで既存挙動が変わる** → Mitigation: config load はベストエフォート（失敗 → 無効扱い）。既定無効なので既存 validate テスト（designLayer 未設定）は spawn せず green のまま。
- **[Risk] preflight に gate を足すことで既存 preflight テストが壊れる** → Mitigation: 既存テストは `loadConfig` を `{runtime:"local"}`（designLayer 不在）に mock 済みで、gate は無効 → spawn せず素通り。
- **[Risk] fake 実行体のシェバン / 実行権限で環境差** → Mitigation: 主経路は注入 `SpawnFn` で実行体不要。実 spawn が要る少数ケースのみ node スクリプト（`node <path>`）等、移植性の高い形にする。
- **[Risk] mark 冪等性が崩れると archive 再実行で二重遷移** → Mitigation: 契約が「再実行 no-op / 全遷移 or 全不変」を保証。spec-runner 側は毎回そのまま呼ぶだけ（状態を持たない）。
- **[Risk] PR 番号不在（no-worktree / PR 作成前 archive）** → Mitigation: `--pr` は契約上任意。`prNumber === undefined` なら省略して mark を実行（契約が許容）。

## Open Questions

- **doctor の presence probe flag**: `aozu --version` が契約で保証されているか未確認。保証されない場合、`codex-cli.ts` パターン（`--version`）のままだと present でも reject し得る。実装時に aozu の benign な presence probe（`--version` 又は `--help`）を確認する。確認できない場合の fallback は「ENOENT のみを『不在』と判定し、present だが flag 非対応は warn 扱い」。本 Open Question は doctor check のみに影響し、gate / hook の合否判定（exit code 契約は明記済み）には影響しない。
