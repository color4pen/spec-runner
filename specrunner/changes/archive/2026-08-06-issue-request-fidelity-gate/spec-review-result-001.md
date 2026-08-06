# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読み込んだファイル
- `specrunner/changes/issue-request-fidelity-gate/request.md` — 要件・受け入れ基準・設計判断
- `specrunner/changes/issue-request-fidelity-gate/design.md` — 設計判断 D1〜D10
- `specrunner/changes/issue-request-fidelity-gate/spec.md` — Requirement / Scenario 一覧
- `specrunner/changes/issue-request-fidelity-gate/tasks.md` — タスク一覧・AC 対応表

### 参照した実コード
- `src/core/command/runner.ts` — `CommandRunner.execute()` の実際のフロー（seam 位置の確認）
- `src/core/command/pipeline-run.ts` — `PipelineRunCommand.prepare()` / `PipelineRunOptions`
- `src/core/command/resume.ts` — `ResumeCommand` の constructor と `prepare()`
- `src/core/pipeline/pipeline.ts` — `FATAL_ERROR_CODES` の内容確認
- `src/errors.ts` — `ERROR_CODES` の現状確認
- `src/kernel/github-client.ts` + `src/core/port/github-client.ts` — port interface の現状（getIssue 未存在を確認）
- `src/adapter/github/github-client.ts` — `listIssueComments` 等の既存実装様式
- `src/adapter/claude-code/query-one-shot.ts` — `queryOneShot` インターフェース
- `src/core/inbox/run-inbox.ts:397-400` — inbox startJob の現状（inboxOrigin 未渡しを確認）
- `src/state/schema/types.ts:435` — `JobState` の `issueNumber` 近傍
- `src/state/lifecycle.ts` — `transitionJob` API・`VALID_TRANSITIONS`
- `src/core/resume/resolve-step.ts` — `resolveResumeStep` / `checkConsecutiveEscalations` との関係
- `src/core/resume/safety.ts:81-103` — `checkConsecutiveEscalations` の実装
- `src/core/notify/issue-notifier.ts:230-251` — `notifyJobTerminal` の awaiting-resume 挙動
- `src/core/types.ts` — `PipelineDeps` の `cwd?`（optional）/ `runtimeStrategy?` の確認
- `src/core/runtime/local.ts:562-588` / `src/core/runtime/managed.ts:316-337` — `buildDeps` での `cwd` 設定確認
- `src/prompts/design-system.ts` — 既存の injection boundary タグ（`<user-request>`）パターン
- `tests/unit/architecture/core-invariants.test.ts` + `arch-allowlist.ts` — B-1 境界制約の確認
- `tests/unit/architecture/request-entrance-llm-boundary.test.ts` — B-18 境界制約の確認
- `tests/unit/prompts/design-system.test.ts` — prompt contract テスト様式

### 検証した設計前提の真偽

| 設計前提 | 確認結果 |
|---|---|
| `pipeline.run` 呼び出し前に registerCleanup が完了する（seam 存在） | ✓ runner.ts:224 vs 251-252 で確認 |
| `run → awaiting-resume` は VALID_TRANSITIONS に含まれる | ✓ lifecycle.ts:37 |
| `FATAL_ERROR_CODES` は SESSION_CREATE_FAILED / CONFIG_* のみ | ✓ pipeline.ts:19-24 |
| inbox `startJob` は現状 `inboxOrigin` を渡さない（T-05 の出発点） | ✓ run-inbox.ts:400 |
| `GitHubClient` に `getIssue` が存在しない（T-01 の出発点） | ✓ kernel/github-client.ts 末尾確認 |
| `resolveResumeStep` は `resumePoint.step` を `toStepName()` に渡す | ✓ resolve-step.ts:101 |
| `notifyJobTerminal` は awaiting-resume 時に escalation comment を書く | ✓ issue-notifier.ts:236-242 |
| `deps.runtimeStrategy` は `RuntimeStrategy` の `commitFinalState` を持つ | ✓ runtime-strategy.ts:426 |
| `deps.cwd` は local/managed いずれも `workspace.cwd` で必ず設定される | ✓ local.ts:577, managed.ts:331 |
| B-1: core/ は adapter/ を import しない（gate は port interface 注入） | ✓ 設計が port 依存のみで構成 |
| B-18: `src/cli/run.ts` / `resume.ts` への adapter import は許可範囲内 | ✓ B-18 は registry.ts のみスキャン |

### 受け入れ基準 → タスク対応表の完全性
tasks.md の AC 対応表（AC1〜AC10）は request.md の 10 受け入れ基準をすべて網羅。欠落なし。

### spec.md の Requirement/Scenario 網羅性
spec.md に 9 Requirement・12 Scenario が定義されており、request.md の要件 1〜7 を一対一でカバーしている。欠落なし。

## 検証できなかった項目

- **`checkConsecutiveEscalations` が gate halt を消費するかの動的挙動**: コード読解で静的に確認（design doc との差異を発見）したが、実テストでの動的確認は未実施。影響は設計文書の表記誤りのみ（実動作には影響なし）。
- **managed runtime での comparator の実動作**: D9 の "managed で LLM 認証が無ければ throw → fail-closed" は構造から確認可能だが、実際の managed runtime path での統合テストは未実施（本 request はローカル runtime を主対象としている）。

## Findings 詳細

### F-01: design.md D2 のカウンター共有記述が不正確（informational）

`checkConsecutiveEscalations`（`src/core/resume/safety.ts:81-103`）は `state.steps[stepName]` のエントリ数を検査する。`state.steps['request-review']` にはステップが実際に実行された場合のみエントリが追加される。gate halt は `pipeline.run` を呼ばないため step エントリを作らない。

したがって gate halt は `checkConsecutiveEscalations` のカウンターを消費しない。D2 リスク欄の「request-review anchor での連続 escalation は checkConsecutiveEscalations の 3 回 → --force 要求と同一 counter を共有する」は不正確。実際の挙動は記述より寛容（gate halt が何度続いても `--force` は要求されない）。

設計判断の正しさには影響なし。実装を誤らせるリスクも低い（挙動が設計より有利な方向に逸れるため）。design.md の補足説明レベルの誤りとして記録する。

### F-02: `deps.cwd` の型は optional（StepContext: `cwd?: string`）だが実装で必ず設定される

T-09 の実装案は `path.join(deps.cwd, requestMdPath(slug))` と `deps.cwd` を null-check なしに参照する。`StepContext.cwd` は型上 `string | undefined`。両 runtime は常に `workspace.cwd`（非 null）を設定するため実運用での問題は生じないが、テスト fakes で `cwd` を設定しないと `TypeError` になる。

実装時のテスト記述で `deps.cwd` を明示設定する必要があることを認識しておく。ブロッキングではないが、実装タスク T-09 の結合テスト記述時に注意が必要。

### F-03: 非伝播は drop 記述に対してはプロンプト指示のみで機械的保証なし（informational）

halt 時の `error.message` / `reason` に含まれる undeclared drop 列挙は、LLM が「issue 本文の丸写しをしない」プロンプト指示を遵守することに依存する。sentinel テスト（AC4）はリテラルの sentinel 文字列が state に現れないことを検証するが、LLM が言い換えた場合はキャッチされない。

これは設計で意図的に受け入れた非決定性（「精度は port 差し替えで改善可能」）であり、ブロッキングではない。

### F-04: prompt injection 経路の boundary tag は既存パターンに整合（informational、リスク低）

issue 本文は GitHub API 経由の外部入力であり、攻撃者制御可能なコンテンツを含みうる。T-06 の prompt では `<issue>` / `<request>` XML タグで区切ることを指定しており、これは既存の `<user-request>` タグパターン（design-system.ts:126-128）と整合している。

悪意ある issue body（例: `</issue>` を含む文字列）による injection リスクは理論上存在するが、影響は「gate の false pass（pipeline が走る）」に限定され、pipeline 自体は issue 本文を受け取らない（非伝播設計）。developer tool のコンテキストでは許容可能なリスク。
