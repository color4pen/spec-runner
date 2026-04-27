# Implementation Notes: 2026-04-27-cli-core-pipeline

## Status

- **result**: partial
- **tasks_completed**: ~45/50（推定。implementer subagent が usage limit で停止し、最終チェックリスト確認は未実施）
- **timestamp**: 2026-04-27 21:15

> 主要モジュール 30 ファイル + テスト 6 ファイル + プロジェクト設定一式は完成。typecheck PASS / build PASS / test PASS（49/49）を確認済み。must テストカバレッジに未実装が残る（63 must 中 41 実装、22 未実装）。残作業は code-review フィードバック → code-fixer のループで解消する想定。

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| package.json | created | dependencies/@anthropic-ai/sdk、devDeps/typescript+vitest+@types/node、scripts、bin/specrunner |
| tsconfig.json | created | ES2022/NodeNext bundler/strict、bun 型は include しない |
| vitest.config.ts | created | node 環境、tests/*.test.ts と src/**/__tests__ |
| bin/specrunner.ts | created | CLI dispatcher（init/login/run/ps）、--help、不明 cmd で exit 2 |
| src/errors.ts | created | SpecRunnerError + 全 error code 定数（CONFIG_MISSING〜CHANGE_FOLDER_NOT_FOUND） |
| src/logger/stdout.ts | created | 進捗 / success / error / warning の stdout/stderr ヘルパ |
| src/util/atomic-write.ts | created | temp+rename + permission 強制（module-analysis R1 採用） |
| src/util/xdg.ts | created | XDG_CONFIG_HOME / XDG_DATA_HOME 解決（module-analysis R2 採用） |
| src/parser/request-md.ts | created | request.md パーサ（type / title / content / enabled） |
| src/git/remote.ts | created | execFile("git", ...) で origin 解決、HTTPS/SSH 両対応 |
| src/sdk/client.ts | created | Anthropic SDK passthrough wrapper |
| src/sdk/agents.ts | created | beta.agents の薄い wrapper |
| src/sdk/environments.ts | created | beta.environments の薄い wrapper |
| src/sdk/sessions.ts | created | beta.sessions wrapper + isCustomToolUseEvent / isStatusIdleEvent narrowing helpers |
| src/config/schema.ts | created | Config 型 + バリデーション（apiKey/agentId/environmentId/github） |
| src/config/store.ts | created | atomic write + 0600 permission + 緩いパーミッション warning |
| src/state/schema.ts | created | JobState 型 + appendHistoryEntry pure transform（最大 100 truncate） |
| src/state/store.ts | created | createJobState / persistJobState / listJobStates / 破損 skip |
| src/auth/constants.ts | created | GitHub Device Flow 定数（CLIENT_ID 既定値） |
| src/auth/github-device.ts | created | Device Flow OAuth（fetch + polling、authorization_pending/slow_down/expired_token/access_denied 全分岐） |
| src/core/tools/types.ts | created | CustomTool 型 + defineCustomTool factory |
| src/core/tools/registry.ts | created | tools[] 単一保持 + getDefinitions / getHandler |
| src/core/tools/register-branch.ts | created | definition + handler colocate（last-write-wins） |
| src/core/tools/index.ts | created | registerCustomTool(registerBranchTool) bootstrap |
| src/core/agent-definition.ts | created | PROPOSE_SYSTEM_PROMPT + custom_tools registry definitions + toolset + model + definitionHash |
| src/core/preflight.ts | created | fail-fast バリデーション 5 段階（module-analysis S5 採用） |
| src/core/completion.ts | created | isProposeComplete 述語 + pollUntilComplete（指数バックオフ 1→3→9→27、上限 30s） |
| src/core/session.ts | created | startProposeSession（SSE + dispatch + initial message + AbortSignal キャンセル） |
| src/core/pipeline.ts | created | runProposePipeline（状態遷移 + history + change folder 検証 + 失敗遷移マッピング） |
| src/cli/init.ts | created | API key 取得 → Agent 作成/同期 → Environment 作成 → rollback → config 保存 |
| src/cli/login.ts | created | Device Flow → token 保存 |
| src/cli/run.ts | created | preflight → request パース → jobState 作成 → pipeline 起動 |
| src/cli/ps.ts | created | listJobStates → TTY/非TTY 出力（createdAt 降順、BRANCH 40 truncate、TAB 区切り） |
| src/prompts/propose-system.ts | created | PROPOSE_SYSTEM_PROMPT（user-request XML 区切り、register_branch 必須化） |
| tests/parser.test.ts | created | TC-001-005, TC-007（185 lines） |
| tests/git-remote.test.ts | created | TC-008-013, TC-015 |
| tests/custom-tools.test.ts | created | TC-016-023, TC-025（registry / handler / colocate 検証） |
| tests/completion.test.ts | created | TC-026-028, TC-031, TC-032, TC-034 |
| tests/state-store.test.ts | created | TC-043-048（atomic / SIGINT / 並行 / truncate / 破損 skip / XDG）（265 lines） |
| tests/github-device.test.ts | created | TC-075-079（authorization_pending / slow_down / expired / access_denied / env override） |

## Blocked Tasks

| Task | Reason |
|------|--------|
| implementation-notes.md 自動生成 | implementer subagent が org monthly usage limit で停止。本ファイルは手動生成（オーケストレータ補完） |
| must テスト 22 件の未実装 | 上記同様。下記「Test Coverage Gaps」参照 |

### Test Coverage Gaps（must、未実装 22 件）

| TC | Area | Note |
|----|------|------|
| TC-006 | parser | 未知の type を warning 継続 |
| TC-014 | git | origin 未設定 |
| TC-024 | tools | description が 3 文以上 |
| TC-029 | completion | 指数バックオフの初期 3 回間隔 |
| TC-030 | completion | 上限 30000ms クランプ |
| TC-033 | completion | --timeout フラグ上書き |
| TC-035-042 | pipeline | 状態遷移全記録 / register_branch 未呼び出し / SSE 順序 / user-request タグ / CHANGE_FOLDER_NOT_FOUND / branch 不在 warn / 401 / セッション params |
| TC-052 | config | 緩い permission warning |
| TC-054 | config | login 未実行（github.accessToken 欠落） |
| TC-055 | config | 機微情報が stdout に出ない |
| TC-056 | config | XDG_CONFIG_HOME 未設定パス |
| TC-057-062 | init | 初回 / API key 未設定 / 冪等 / agents.update / Env 失敗 rollback / packages 検証 |
| TC-063-068 | run/ps | fail-fast 順序 3 系統 / ps 破損 skip / 0 件 / 非 TTY |
| TC-070-072 | misc | agent ハッシュ同一性 / フィールド順序吸収 / 不明 cmd exit 2 |
| TC-080 | manual | post-init 不変条件（実機） |

これらは code-review の testing カテゴリで指摘される想定。code-fixer ループで補完する。

## Deviations from Spec

### 1. cli/init.ts の Environment 作成パラメータ

**spec / design**: `EnvironmentCreateParams` に `packages` を直接渡す記述（design.md / specs/agent-environment-bootstrap）

**実装**: SDK 0.91.0 の `EnvironmentCreateParams` は `packages` を直接受け付けない。`config.packages` のネストが必要（`{ name, config: { type: "cloud", packages: { type: "packages", npm: [...] } } }`）。SDK 型定義に従い修正済み。

**理由**: SDK 型を正として優先（constraints.md「外部 SDK に依存する設計は、実装前に型定義を調査し仕様に反映する」に整合）。仕様側の修正は spec-fixer または次イテレーションで対応推奨。

### 2. fs.Dirent の型 import

**実装**: `node:fs/promises` には `Dirent` 型が re-export されておらず、`node:fs` から import する必要があった。

**理由**: Node.js 標準型定義の制約。実装で吸収。

### 3. 静的解析テスト regex の精緻化

**初期実装**: `/\bexec\s*\(/` で `exec(` 全般を禁止 → `regex.exec(...)` の正規表現メソッド呼び出しまで拒否してしまうバグ。

**修正**: `child_process.exec(` / `import { exec } from "node:child_process"` を限定的にチェックする 3 つの regex に分離。

## Module Analysis Adoption

| Recommendation | Decision | Rationale |
|----------------|----------|-----------|
| R1: src/util/atomic-write.ts に共通化 | **採用** | config と state の両方で再利用（drift 防止） |
| R2: src/util/xdg.ts に共通化 | **採用** | XDG 解決を 1 箇所に集約 |
| R3: state.history を pure transform に分離 | **採用** | appendHistoryEntry を schema.ts に置き、store.ts の I/O から分離 |
| R4: util/exec.ts への抽出 | **不採用** | 現時点では git 呼び出しは 1 箇所のみ。Phase 2 で再評価 |
| R5: SDK narrowing を sdk/sessions.ts に集約 | **採用** | isCustomToolUseEvent / isStatusIdleEvent / isStatusTerminatedEvent を集約 |
| S1: tool registry colocate factory + 単一参照 | **採用** | tools/types.ts + registry.ts + register-branch.ts + index.ts の 4 ファイル構成。Bug 1 の構造的予防 |
| S2: state I/O とビジネスロジック分離 | **採用** | createJobState / appendHistoryEntry を pure に、persistJobState を impure に |
| S3: isProposeComplete 述語の集約 | **採用** | completion.ts に export し SSE/polling の両 loop で参照 |
| S4: SDK 型を core から直接 import しない | **採用** | core/* は sdk/sessions.ts の narrowing helpers のみを参照 |
| S5: cli/run.ts の preflight を core/preflight.ts へ | **採用** | runPreflight() を 1 関数に集約 |

## Fix History

| Retry | Findings Applied | Files Modified |
|-------|-----------------|---------------|
| 1 | H1 (race condition), H3 (terminationReason), H4 (must tests), M9 (ternary dead code), M11 (loadJobState dead code), M13 (module-level state), M16 (unused param), M17 (isRequiresActionIdle dead export) | src/core/pipeline.ts, src/core/session.ts, src/core/tools/register-branch.ts, src/core/tools/index.ts, src/cli/run.ts, src/cli/init.ts, src/state/store.ts, src/sdk/sessions.ts, tests/pipeline.test.ts (new, 8 tests), tests/init.test.ts (new, 5 tests), tests/cli.test.ts (new, 7 tests), tests/agent-definition.test.ts (new, 2 tests) |

## Verification Snapshot（オーケストレータ手動確認）

| Phase | Result | Note |
|-------|--------|------|
| typecheck | PASS | tsc --noEmit、エラー 0 件 |
| build | PASS | tsc --outDir dist、dist/ 生成確認 |
| test | PASS | vitest 49/49 PASS、6 test files |
| lint | N/A | プロジェクトに lint ツール未導入（ESLint/Biome 未設定） |
| security-scan | N/A | プロジェクトに導入なし |
| CLI smoke | PASS | `node dist/bin/specrunner.js --help` で USAGE 表示確認 |
