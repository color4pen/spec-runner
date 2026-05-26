# Review Feedback 002

- **verdict**: needs-fix

## Summary

実装の core ロジック（deepMergeConfig / 6-level resolution / byRequestType validation / requestType 伝搬）は設計通りで、`bun run typecheck && bun run test` も green（256 files / 2899 tests）。ただし iter-1 で指摘された 2 件（`FileConfigStore.load(repoRoot)` 欠落 / spec と実装の standalone validation 逸脱）が **未修正のまま** であり、加えて `ResumeCommand.prepare()` 内に重複した `loadConfig()` 呼び出しが project local overlay を無効化する追加バグを発見した。

## Findings

### [major] [correctness] `ResumeCommand.prepare()` の loadConfig が repoRoot を渡さず project local overlay が無効化される
**File**: src/core/command/resume.ts:202
**Description**: `runResumeCore` は `bootstrap(cwd, repo)` 経由で `loadConfig(repoRoot)` を呼んでいる一方、その後実行される `ResumeCommand.prepare()` は line 202 で `loadConfig()` を再呼び出し（repoRoot 未指定）し、その結果を `PrepareResult.config` に詰めて pipeline に渡している。`cwd` は line 70 でスコープ内に存在するが利用されていない。これにより `specrunner resume <slug>` 経路では project local overlay が常に無視され、user global config 単独の挙動になる。tasks.md Task 9 の audit で `resume.ts` は「bootstrap() → OK」とだけ書かれており、`ResumeCommand.prepare()` 内の二重 load が見落とされている。test-cases.md TC-35 が「run コマンド経由で project local が反映される」ことしか検証していないため CI は通る。
**Fix**: `loadConfig(cwd)` に変更し、duplicate load を避けたいなら `bootstrap()` の結果を `ResumeCommand` に注入する経路を整理する（例: `PrepareResult.config` は `runResumeCore` の bootstrap 結果を使い、`prepare()` の再 load を削除）。

---

### [minor] [correctness] iter-1 LOW-1（FileConfigStore.load の repoRoot 欠落）が未修正
**File**: src/config/store.ts:170-173
**Description**: review-feedback-001.md で LOW-1 として「`FileConfigStore.load()` が repoRoot を渡さない」と指摘されているが、iter-2 でも該当箇所は変更されていない（`this.cachedConfig = await loadConfig();`）。public API として export されている class が project local overlay を無視する状態が残る。production からの呼び出しはまだないが、将来の利用者が overlay を無視してしまう型シグネチャ漏れ。
**Fix**: `async load(repoRoot?: string): Promise<SpecRunnerConfig>` にして `loadConfig(repoRoot)` に渡す。または constructor で `repoRoot` を受け取り内部保持する。

---

### [minor] [spec-alignment] iter-1 LOW-2（project-only 部分 config が CONFIG_INVALID にならない）の対応が未完了
**File**: src/config/store.ts:115-118, src/config/migrate.ts:115-120, specrunner/changes/project-config-overlay/specs/cli-config-store/spec.md:271-276
**Description**: review-feedback-001.md LOW-2 で「`applyMigration` が `version: 1` と `agents: {}` を自動付与するため部分 project-only config が valid として通る → spec/test-cases と乖離」と指摘されているが、iter-2 でも実装にも spec にも変更がない。`spec.md` の Scenario `project local のみで部分 config は CONFIG_INVALID` は依然として「GIVEN project local に `{ "steps": ... }` のみ存在（version なし） / THEN CONFIG_INVALID」と書かれているのに対し、`tests/config/store.test.ts:120-128` は migration による version 補完で valid 扱いとなる挙動を「正」として固定化している。spec と test/impl が矛盾したまま。
**Fix**: いずれかを正に揃える:
- (a) spec の `project local のみで部分 config は CONFIG_INVALID` Scenario を削除または書き換え、migration による version 補完を仕様化する
- (b) project-only 経路でのみ migration の version 補完をスキップして spec 通り CONFIG_INVALID にする
iter-1 の推奨案は (a)。少なくとも spec.md / test-cases.md TC-03 を実装に合わせて書き換え、判断を文書化する必要がある。

---

### [minor] [audit-completeness] CLI entry の loadConfig 監査漏れ — repoRoot 未伝搬の経路が複数残存
**File**: src/cli/command-registry.ts:215,304, src/cli/login.ts:20, src/cli/init.ts:30, src/cli/doctor.ts:84, src/cli/managed.ts:50,151,200
**Description**: tasks.md Task 9 で各 CLI entry の audit がチェック済みとなっているが、実際には `request generate` / `request review` / `login` / `init` / `doctor` / `managed setup` 系で `loadConfig()` が引数なしで呼ばれており project local overlay が反映されない。design.md / tasks.md は「best-effort / 診断目的のため例外」とコメントを付けているが、`managed setup` / `managed sync` のような state-modifying command は best-effort の理由が成立しない。少なくとも `repoRoot` 解決可能な command（cwd を持つもの）では `loadConfig(repoRoot)` に揃える方が一貫性がある。
**Fix**: 各 CLI command で `process.cwd()` から `resolveRepoRoot()` を best-effort で呼び、得られた `repoRoot` を `loadConfig(repoRoot ?? undefined)` に渡す共通 helper を作る（例: `src/cli/load-config-with-overlay.ts`）。少なくとも `managed.ts` / `command-registry.ts` 経路は対応すべき。

---

### [minor] [test-coverage] test-cases.md の must TC のうち array 置換ケース（TC-13）の専用テスト不在
**File**: tests/config/merge.test.ts
**Description**: test-cases.md TC-13（must）は「`base.models = ["model-a", ...]` と `overlay.models = ["model-c"]` → 結果は `["model-c"]`」と array の完全置換挙動を要求しているが、merge.test.ts には array を扱うケースが存在しない。`deepMergeConfig` 実装には array 判定（merge.ts:57, 60）があるため挙動自体は備わっているが、回帰防止のためのテストが欠落している。なお `SpecRunnerConfig.models` は `Record<string, ModelEntry>`（object）であり test-cases.md TC-13 の「`models` を array とする」前提自体が schema と不整合（test-cases.md 側の問題）。
**Fix**: test-cases.md TC-13 を「pure な `deepMergeObjects` レベルで array が overlay 置換される」ケースに書き直すか、削除する。テスト側は適当な array fixture（generic な内部関数経由）で挙動を pin する。

---

### [nit] [test-coverage] TC-10 で参照されている `provider` field が `SpecRunnerConfig` schema に存在しない
**File**: specrunner/changes/project-config-overlay/test-cases.md:75-78
**Description**: test-cases.md TC-10 は「`base.provider = "claude"` と `overlay.provider = "openai"`」を例にしているが、`SpecRunnerConfig` に `provider` フィールドはない。実テストは `runtime` / `version` などで primitive override を検証しており実用上問題はないが、test-cases.md の文言が schema と乖離している。
**Fix**: TC-10 を `runtime` などの実在フィールドに置き換える。

---

### [nit] [docs] managed runtime で `byRequestType.model` がサイレント無視される旨が README/project.md に未記載
**File**: README.md, specrunner/project.md
**Description**: iter-1 INFO で「managed runtime では `model` 設定が無視される」点が README に未記載と指摘されたが iter-2 でも追記されていない。managed runtime ユーザーが `byRequestType.<type>.model` を書いてもサイレントに無視されるため設定例の近くに注記が必要。
**Fix**: README の project local config の設定例セクションに「managed runtime では model 系設定は agent definition 側で管理されるため byRequestType / model field は無視される」旨を一文追加。

---

### [nit] [code-quality] `queryOneShot()` に `requestType` が伝搬されていない（仕様上は許容範囲）
**File**: src/adapter/claude-code/query-one-shot.ts:96-100
**Description**: `query-one-shot.ts` は `getStepExecutionConfig(config, stepName, stepDefaults)` を呼んでおり requestType 引数を渡していない。tasks.md Task 7 は「`getStepExecutionConfig` を呼んでいる場合は requestType 対応」と記述しているが、`queryOneShot` は呼び出し元が request type を知らない `request generate` / `request review` 経路から使われるため意図的な未対応と思われる。ただし `QueryOneShotOptions` に `requestType?: string` field を追加して呼び出し元が伝搬可能にする余地は残っている。`request review` 経路は対象 request.md の type が読めるため一貫性のため拡張する選択肢あり。
**Fix**: `QueryOneShotOptions.requestType` field を追加し、`request review` 呼び出し時に `ParsedRequest.type` を伝搬する。必須ではない。

---

## Test Coverage vs test-cases.md

| カテゴリ | must TC | カバー状況 |
|---------|---------|-----------|
| overlay-load (TC-01〜07) | 7/7 | covered（TC-03 は impl 挙動逸脱が残存・LOW-2） |
| deep-merge (TC-09〜14) | 5/6 | TC-13 (array 置換) のみ専用テスト無し |
| byRequestType-resolution (TC-15〜20) | 6/6 | covered |
| validation (TC-23〜29) | 7/7 | covered |
| cli-early-validation (TC-33, 35) | 2/2 | covered（ただし resume 経路の overlay 反映は major 指摘あり） |
| regression (TC-36〜38) | 3/3 | green |

## Verdict 詳細

iter-1 で指摘された 2 件（LOW-1 / LOW-2）が未対応であり、加えて新規発見の major issue（ResumeCommand の duplicate loadConfig が project local overlay を無効化）がある。`needs-fix` 相当だが、major findings は ResumeCommand 経路 1 箇所のみで影響範囲は限定的。`bun run typecheck && bun run test` は green。
